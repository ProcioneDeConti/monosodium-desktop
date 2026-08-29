// File export for the Dashboard's "Favorites analysis" shareable card. The frontend rasterises an
// SVG card to PNG (or JPEG, for the PDF path) in the webview canvas, base64-encodes it, and hands
// it here to write to a user-chosen path. Two commands:
//   - `save_export_file`     - decode base64 and write the bytes verbatim (the PNG path).
//   - `save_pdf_with_jpeg`   - wrap a baseline JPEG in a minimal single-page PDF (the PDF path).
// No PDF crate: a one-page image-only PDF is a tiny, well-defined structure and DCTDecode embeds
// JPEG bytes directly, so it's built by hand here.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

fn decode(data_base64: &str) -> Result<Vec<u8>, String> {
    BASE64
        .decode(data_base64.as_bytes())
        .map_err(|e| format!("bad base64 payload: {e}"))
}

/// Write raw bytes (from a base64 payload) to `path`. Used for the PNG export.
#[tauri::command]
pub fn save_export_file(path: String, data_base64: String) -> Result<(), String> {
    let bytes = decode(&data_base64)?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())
}

/// Wrap a baseline (JFIF) JPEG in a minimal one-page PDF and write it to `path`.
/// `width_px` / `height_px` are the JPEG's pixel dimensions.
#[tauri::command]
pub fn save_pdf_with_jpeg(
    path: String,
    jpeg_base64: String,
    width_px: u32,
    height_px: u32,
) -> Result<(), String> {
    let jpeg = decode(&jpeg_base64)?;
    if width_px == 0 || height_px == 0 {
        return Err("invalid image dimensions".into());
    }
    let pdf = build_image_pdf(&jpeg, width_px, height_px);
    std::fs::write(&path, &pdf).map_err(|e| e.to_string())
}

fn build_image_pdf(jpeg: &[u8], px_w: u32, px_h: u32) -> Vec<u8> {
    // Page: fit the width to 6 inches (432 pt), height proportional. Fine for an on-screen /
    // "share with friends" document; not tuned for print.
    let page_w = 432.0_f64;
    let page_h = page_w * f64::from(px_h) / f64::from(px_w);

    let mut buf: Vec<u8> = Vec::new();
    // 1-based; index 0 is the free entry.
    let mut offsets = [0usize; 6];

    buf.extend_from_slice(b"%PDF-1.4\n");
    buf.extend_from_slice(&[b'%', 0xE2, 0xE3, 0xCF, 0xD3, b'\n']);

    let obj = |buf: &mut Vec<u8>, offsets: &mut [usize; 6], n: usize, body: &str| {
        offsets[n] = buf.len();
        buf.extend_from_slice(format!("{n} 0 obj\n").as_bytes());
        buf.extend_from_slice(body.as_bytes());
        buf.extend_from_slice(b"\nendobj\n");
    };

    obj(&mut buf, &mut offsets, 1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(&mut buf, &mut offsets, 2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(
        &mut buf,
        &mut offsets,
        3,
        &format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_w:.2} {page_h:.2}] \
             /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>"
        ),
    );

    let content = format!("q {page_w:.2} 0 0 {page_h:.2} 0 0 cm /Im0 Do Q");
    obj(
        &mut buf,
        &mut offsets,
        4,
        &format!("<< /Length {} >>\nstream\n{content}\nendstream", content.len()),
    );

    // Image object: header is text, the stream body is the raw JPEG.
    offsets[5] = buf.len();
    buf.extend_from_slice(
        format!(
            "5 0 obj\n<< /Type /XObject /Subtype /Image /Width {px_w} /Height {px_h} \
             /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {} >>\nstream\n",
            jpeg.len()
        )
        .as_bytes(),
    );
    buf.extend_from_slice(jpeg);
    buf.extend_from_slice(b"\nendstream\nendobj\n");

    let xref_offset = buf.len();
    buf.extend_from_slice(b"xref\n0 6\n");
    buf.extend_from_slice(b"0000000000 65535 f \n");
    for n in 1..=5 {
        buf.extend_from_slice(format!("{:010} {:05} n \n", offsets[n], 0).as_bytes());
    }
    buf.extend_from_slice(b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n");
    buf.extend_from_slice(format!("{xref_offset}\n").as_bytes());
    buf.extend_from_slice(b"%%EOF");

    buf
}
