// File export for the Dashboard's "Favorites analysis" shareable card. The frontend rasterises an
// SVG card to PNG (or JPEG, for the PDF path) in the webview canvas, base64-encodes it, and hands
// it here to write to a user-chosen path. Two commands:
//   - `save_export_file`     - decode base64 and write the bytes verbatim (the PNG path).
//   - `save_pdf_with_jpeg`   - wrap baseline JPEGs in a minimal image-only PDF, one per page.
// No PDF crate: an image-only PDF is a tiny, well-defined structure and DCTDecode embeds
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

/// Like `save_export_file`, but never replaces an existing file: if `path` is taken it tries
/// `stem (2).ext`, `stem (3).ext`... Used for the extra pages of a multi-page export, which the
/// save dialog's overwrite prompt never saw. Returns the path actually written.
#[tauri::command]
pub fn save_export_file_new(path: String, data_base64: String) -> Result<String, String> {
    use std::io::Write;
    let bytes = decode(&data_base64)?;
    let base = std::path::PathBuf::from(&path);
    let stem = base.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = base.extension().map(|s| format!(".{}", s.to_string_lossy())).unwrap_or_default();
    for n in 1..1000 {
        let candidate = if n == 1 { base.clone() } else { base.with_file_name(format!("{stem} ({n}){ext}")) };
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&candidate) {
            Ok(mut f) => {
                f.write_all(&bytes).map_err(|e| e.to_string())?;
                return Ok(candidate.to_string_lossy().into_owned());
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("no free file name".into())
}

/// Wrap one or more baseline (JFIF) JPEGs - one per page, all the same pixel size - in a minimal
/// image-only PDF and write it to `path`. `width_px` / `height_px` are each JPEG's dimensions.
#[tauri::command]
pub fn save_pdf_with_jpeg(
    path: String,
    jpegs_base64: Vec<String>,
    width_px: u32,
    height_px: u32,
) -> Result<(), String> {
    if width_px == 0 || height_px == 0 {
        return Err("invalid image dimensions".into());
    }
    if jpegs_base64.is_empty() {
        return Err("no pages to export".into());
    }
    let jpegs = jpegs_base64
        .iter()
        .map(|j| decode(j))
        .collect::<Result<Vec<_>, _>>()?;
    let pdf = build_image_pdf(&jpegs, width_px, height_px);
    std::fs::write(&path, &pdf).map_err(|e| e.to_string())
}

fn build_image_pdf(jpegs: &[Vec<u8>], px_w: u32, px_h: u32) -> Vec<u8> {
    // Page: fit the width to 6 inches (432 pt), height proportional. Fine for an on-screen /
    // "share with friends" document; not tuned for print.
    let page_w = 432.0_f64;
    let page_h = page_w * f64::from(px_h) / f64::from(px_w);
    // Objects: 1 catalog, 2 pages, then per page i: page (3+3i), contents (4+3i), image (5+3i).
    let n_obj = 2 + 3 * jpegs.len();

    let mut buf: Vec<u8> = Vec::new();
    // 1-based; index 0 is the free entry.
    let mut offsets = vec![0usize; n_obj + 1];

    buf.extend_from_slice(b"%PDF-1.4\n");
    buf.extend_from_slice(&[b'%', 0xE2, 0xE3, 0xCF, 0xD3, b'\n']);

    let obj = |buf: &mut Vec<u8>, offsets: &mut Vec<usize>, n: usize, body: &str| {
        offsets[n] = buf.len();
        buf.extend_from_slice(format!("{n} 0 obj\n").as_bytes());
        buf.extend_from_slice(body.as_bytes());
        buf.extend_from_slice(b"\nendobj\n");
    };

    let kids: Vec<String> = (0..jpegs.len()).map(|i| format!("{} 0 R", 3 + 3 * i)).collect();
    obj(&mut buf, &mut offsets, 1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(
        &mut buf,
        &mut offsets,
        2,
        &format!("<< /Type /Pages /Kids [{}] /Count {} >>", kids.join(" "), jpegs.len()),
    );

    for (i, jpeg) in jpegs.iter().enumerate() {
        let (page, contents, image) = (3 + 3 * i, 4 + 3 * i, 5 + 3 * i);
        obj(
            &mut buf,
            &mut offsets,
            page,
            &format!(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_w:.2} {page_h:.2}] \
                 /Resources << /XObject << /Im0 {image} 0 R >> >> /Contents {contents} 0 R >>"
            ),
        );
        let content = format!("q {page_w:.2} 0 0 {page_h:.2} 0 0 cm /Im0 Do Q");
        obj(
            &mut buf,
            &mut offsets,
            contents,
            &format!("<< /Length {} >>\nstream\n{content}\nendstream", content.len()),
        );
        // Image object: header is text, the stream body is the raw JPEG.
        offsets[image] = buf.len();
        buf.extend_from_slice(
            format!(
                "{image} 0 obj\n<< /Type /XObject /Subtype /Image /Width {px_w} /Height {px_h} \
                 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {} >>\nstream\n",
                jpeg.len()
            )
            .as_bytes(),
        );
        buf.extend_from_slice(jpeg);
        buf.extend_from_slice(b"\nendstream\nendobj\n");
    }

    let xref_offset = buf.len();
    buf.extend_from_slice(format!("xref\n0 {}\n", n_obj + 1).as_bytes());
    buf.extend_from_slice(b"0000000000 65535 f \n");
    for off in offsets.iter().skip(1) {
        buf.extend_from_slice(format!("{off:010} {:05} n \n", 0).as_bytes());
    }
    buf.extend_from_slice(format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n", n_obj + 1).as_bytes());
    buf.extend_from_slice(format!("{xref_offset}\n").as_bytes());
    buf.extend_from_slice(b"%%EOF");

    buf
}
