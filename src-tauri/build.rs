fn main() {
    // wireguard.rs embeds the wireproxy binary when scripts/fetch-wireproxy.mjs has put it here;
    // without it the build still succeeds and the VPN reports itself as unavailable.
    println!("cargo::rustc-check-cfg=cfg(has_wireproxy)");
    println!("cargo::rerun-if-changed=vendor/wireproxy.exe");
    if std::path::Path::new("vendor/wireproxy.exe").exists() {
        println!("cargo::rustc-cfg=has_wireproxy");
    }
    tauri_build::build()
}
