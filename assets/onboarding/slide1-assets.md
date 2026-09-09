# Slide 1 reference assets

These assets are used only by `VibeIntroSlide`. The header, wordmark, Skip, headline, supporting copy, swipe hint, and Next button remain React Native elements. No complete screenshot is rendered as the application.

Source: user-supplied `Screenshot 2026-09-09 at 12.06.47.png`, the original dancer/tilted-phone target. The screenshot numbering in the pasted brief was reversed; its detailed description identifies this target unambiguously.

Tool: built-in image generation, reference edit mode. These are derived artwork assets, not the original layered design files.

- `vibes-phone-reference.png`: isolated diagonal phone with the neon dancer, three stacked cards, cyan/purple borders, and inner navigation; background matched to `#090C12`.
- `vibes-brand-mark.png`: the purple symbol without the white application-icon tile; background matched to `#090C12`.

## Prompts

Phone extraction: Extract ONLY the large tilted black smartphone with its three stacked Vibes cards from the supplied reference. Preserve the reference phone silhouette, diagonal perspective (top upper-left, bottom lower-right), proportions, dark metal rim, cyan/purple borders and inner bottom navigation. Preserve the neon-lit adult woman dancing, pose, and card imagery. Remove all outer screen UI: time/status icons, WeNitro wordmark, Skip, headline, body, swipe hint, Next and gesture bar. Reconstruct only the small phone edge hidden by the headline. Frame tightly, about 1:1.08, with no unrelated elements.

Phone background refinement: Change only the checkerboard background to flat solid `#090C12`, preserving phone artwork, framing, silhouette, text, media, and perspective. No checkerboard, halo, texture or new content.

Brand extraction: Extract only the purple WeNitro symbol at top left, preserve its shape and purple gradient on `#090C12`. Exclude wordmark, white app-icon tile, phone and all other UI.

## Layout and motion

The first slide uses its own component and proportional anchors: header 5.7% of screen height, phone 18%, headline 64%, CTA bottom gap 5.2%. Typography and horizontal spacing scale with phone width. Motion is a staggered fade and small upward translation, plus a 0.975-to-1 hero scale, disabled for reduced motion. The existing second-slide layout/styles and onboarding-completion storage are unchanged.
