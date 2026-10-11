use std::path::PathBuf;
use std::str::FromStr;

use base64::prelude::{BASE64_STANDARD, Engine as _};
use lofty::file::TaggedFileExt;
use lofty::picture::{MimeType, PictureType};
use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};

use crate::libs::error::AnyResult;
use crate::libs::utils::scan_dir;

const SUPPORTED_COVER_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "bmp", "gif"];
const SUPPORTED_COVER_NAMES: [&str; 5] = ["album", "albumart", "folder", "cover", "front"];

/// Maps a lofty picture MIME to the data-URL MIME label embedded in `img.src`.
fn cover_mime_label(mime: Option<&MimeType>) -> Option<&'static str> {
    match mime {
        Some(MimeType::Png) => Some("image/png"),
        Some(MimeType::Jpeg) => Some("image/jpeg"),
        Some(MimeType::Tiff) => Some("image/tiff"),
        Some(MimeType::Bmp) => Some("image/bmp"),
        Some(MimeType::Gif) => Some("image/gif"),
        _ => None,
    }
}

#[memoize::memoize]
fn get_cover_from_id3(path: String) -> Option<String> {
    let tagged_file = match lofty::read_from_path(path) {
        Ok(tagged_file) => tagged_file,
        Err(_) => return None,
    };

    let primary_tag = tagged_file.primary_tag()?;

    let cover = primary_tag
        .get_picture_type(PictureType::CoverFront)
        .or_else(|| primary_tag.get_picture_type(PictureType::Illustration))
        .or_else(|| primary_tag.get_picture_type(PictureType::Other))
        .or_else(|| primary_tag.get_picture_type(PictureType::Icon))
        .or_else(|| primary_tag.get_picture_type(PictureType::OtherIcon))?;

    let format = cover_mime_label(cover.mime_type())?;

    let cover_base64 = BASE64_STANDARD.encode(cover.data());
    Some(format!("data:{};base64,{}", format, cover_base64))
}

#[memoize::memoize]
fn get_cover_from_filesystem(path: String) -> Option<String> {
    let dir_path = PathBuf::from_str(&path)
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf();

    scan_dir(&dir_path, &SUPPORTED_COVER_EXTENSIONS)
        .iter()
        .find(|file| {
            let file_stem = file
                .file_stem()
                .unwrap()
                .to_str()
                .unwrap_or("???")
                .to_lowercase();

            SUPPORTED_COVER_NAMES.contains(&file_stem.as_str())
        })
        .map(|path| path.to_str().unwrap().into())
}

#[tauri::command]
pub async fn get_cover(path: String) -> AnyResult<Option<String>> {
    // 1. Try to get the Cover from the ID3 tag
    match get_cover_from_id3(path.clone()) {
        Some(path) => Ok(Some(path)),
        // 2. Cover was not found, so let's fallback to scanning the directory
        // for a valid cover file
        None => Ok(get_cover_from_filesystem(path)),
    }
}

/**
 * Module in charge of assisting the UI with cover retrieval
 */
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("cover")
        .invoke_handler(tauri::generate_handler![get_cover])
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_cover_data_url_uses_full_image_mime() {
        // `src/lib/cover.ts` uses the string verbatim as `img.src` whenever
        // it starts with `data:`, so the label must be a full MIME type.
        assert_eq!(cover_mime_label(Some(&MimeType::Png)), Some("image/png"));
        assert_eq!(
            cover_mime_label(Some(&MimeType::Jpeg)),
            Some("image/jpeg")
        );
        assert_eq!(
            cover_mime_label(Some(&MimeType::Tiff)),
            Some("image/tiff")
        );
        assert_eq!(cover_mime_label(Some(&MimeType::Bmp)), Some("image/bmp"));
        assert_eq!(cover_mime_label(Some(&MimeType::Gif)), Some("image/gif"));
        assert_eq!(cover_mime_label(None), None);

        // The assembled data URL must decode as an image.
        let label = cover_mime_label(Some(&MimeType::Png)).unwrap();
        let url = format!("data:{};base64,AAAA", label);
        assert!(url.starts_with("data:image/"));
    }
}
