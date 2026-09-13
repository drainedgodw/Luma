# Luma showcase media

The repository's showcase media is kept separate from the README gallery.

## Video

Expected file: `docs/showcase/luma-0.2.0-showcase-1440p.mp4`

- Format: H.264/AAC MP4
- Size: 54,589,601 bytes
- Video: 2560×1440, 30 fps
- Duration: 48.1 seconds
- SHA-256: `9896b781fc30c766b1027a00ff24fa7104ac33c4621b91cb4bbefccc023c794d`

Because GitHub's connected file-writing tool accepts text files but cannot upload a 54.6 MB binary attachment, the MP4 could not be transferred in the same commit as the documentation. The local attachment is ready to add with Git LFS:

```sh
git lfs install
mkdir -p docs/showcase
cp /path/to/luma-0.2.0-showcase-1440p.mp4 docs/showcase/
git add .gitattributes docs/showcase/luma-0.2.0-showcase-1440p.mp4
git commit -m "media: add Luma 0.2.0 showcase video"
git push origin main
```

Alternatively, upload the MP4 as a GitHub Release asset and link it from this page. Do not commit it as a regular Git blob: it is larger than the recommended GitHub repository file size and is better handled by Git LFS or Releases.

## Contact sheet

The main README uses a compact contact sheet made from the existing screenshots. Keep new screenshots in `docs/screenshots/` and add them to the HTML table in the README so the visual previews remain easy to scan.
