# Performance notes

The five PNGs loaded by the main page were resized for their existing display sizes, retaining roughly 3x pixel density. File paths are unchanged.

| Asset | Before (bytes) | After (bytes) |
| --- | ---: | ---: |
| `images/firewood.png` | 339,653 | 35,755 |
| `images/mushrooms.png` | 350,707 | 34,552 |
| `images/xmas.png` | 222,784 | 21,775 |
| `logos/BWL_logo.png` | 1,047,923 | 35,275 |
| `logos/URE_flag.png` | 2,723,375 | 4,303 |
| **Total** | **4,684,442** | **131,660** |

This reduces these image bytes by 97.2%. The unused MOT logo was also removed. The favicon is unchanged. These are file-size measurements, not Lighthouse or network-timing results.

The application remains static. PDF generation uses checked-in, self-hosted pdfmake and DejaVu font modules (approximately 1.8 MB combined before HTTP compression), requested only when a no-fee PDF is generated. They do not load during initial browsing or the paid handoff. `npm run build:pdf-vendor` regenerates these files from locked development dependencies; deployment requires no build. Native modules add small JavaScript requests. Total animations run only when the displayed amount changes. Collapsible panels animate grid rows and opacity; reduced-motion preferences disable animations/transitions.

Run `npm run test:browser` for desktop/mobile functional checks. Use browser network tooling or Lighthouse for deployment-specific performance measurements.
