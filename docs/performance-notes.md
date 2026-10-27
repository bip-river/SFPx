# Performance notes

The two PNG logos in the header were resized for their display sizes, retaining roughly 3x pixel density.

| Asset | Before (bytes) | After (bytes) |
| --- | ---: | ---: |
| `logos/BWL_logo.png` | 1,047,923 | 35,275 |
| `logos/URE_flag.png` | 2,723,375 | 4,303 |

The three collection-type photos (92,082 bytes after an earlier resize) were replaced by inline SVG line icons, and the unused MOT logo was removed. The favicon is unchanged. These are file-size measurements, not Lighthouse or network-timing results.

The page font, Atkinson Hyperlegible Next, is self-hosted as two variable WOFF2 subsets: Latin (33,996 bytes, preloaded) and Latin Extended (19,092 bytes, downloaded only when a character from that range appears). `font-display: swap` shows system text until the font arrives.

The 15 sample documents in `documents/` total about 256 KB. A permit package is generated in the browser in about a second on a laptop; packages with haul tags are laid out twice, so the tags can start on the front of a sheet.

The application remains static. PDF generation uses checked-in, self-hosted pdfmake and DejaVu font modules (approximately 1.8 MB combined before HTTP compression), requested only when a permit PDF is generated on the check screen. They do not load while the visitor answers the questions. `npm run build:pdf-vendor` and `npm run build:font-vendor` regenerate the vendored files from locked development dependencies; deployment requires no build. Native modules add small JavaScript requests. Motion is limited to color and progress-bar transitions; reduced-motion preferences disable them.

Run `npm run test:browser` for desktop/mobile functional checks. Use browser network tooling or Lighthouse for deployment-specific performance measurements.
