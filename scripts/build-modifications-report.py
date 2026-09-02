from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/pdf/WeNitro_Modifications_Completion_Report_2026-08-26.pdf"
SOURCE = ROOT / "tmp/pdfs/modifications"
AFTER = ROOT / "report/modifications/assets"
LOGO = ROOT / "assets/wenitro-logo-transparent.png"

PAGE = landscape((960, 540))
W, H = PAGE
INK = colors.HexColor("#11142A")
MUTED = colors.HexColor("#646B7C")
PURPLE = colors.HexColor("#6337E6")
PURPLE_DARK = colors.HexColor("#25125A")
LAVENDER = colors.HexColor("#F1EDFF")
GREEN = colors.HexColor("#15966A")
LINE = colors.HexColor("#E6E2EE")
BG = colors.HexColor("#F7F6FA")


def register_fonts():
    fonts = ROOT / "node_modules/@expo-google-fonts/manrope"
    pdfmetrics.registerFont(TTFont("Manrope", str(fonts / "400Regular/Manrope_400Regular.ttf")))
    pdfmetrics.registerFont(TTFont("Manrope-Semibold", str(fonts / "600SemiBold/Manrope_600SemiBold.ttf")))
    pdfmetrics.registerFont(TTFont("Manrope-Bold", str(fonts / "800ExtraBold/Manrope_800ExtraBold.ttf")))


def rounded_image(c, path, x, y, w, h, radius=10, bg=colors.white, pad=0):
    c.saveState()
    p = c.beginPath()
    p.roundRect(x, y, w, h, radius)
    c.clipPath(p, stroke=0, fill=0)
    c.setFillColor(bg)
    c.rect(x, y, w, h, stroke=0, fill=1)
    image = ImageReader(str(path))
    iw, ih = image.getSize()
    scale = min((w - pad * 2) / iw, (h - pad * 2) / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, mask="auto")
    c.restoreState()


def crop_image(c, path, x, y, w, h, radius=10):
    c.saveState()
    p = c.beginPath()
    p.roundRect(x, y, w, h, radius)
    c.clipPath(p, stroke=0, fill=0)
    image = ImageReader(str(path))
    iw, ih = image.getSize()
    scale = max(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, mask="auto")
    c.restoreState()


def paragraph(c, text, x, y, w, size=12, color=INK, font="Manrope", leading=None, align=TA_LEFT):
    style = ParagraphStyle("copy", fontName=font, fontSize=size, leading=leading or size * 1.35, textColor=color, alignment=align)
    p = Paragraph(text, style)
    _, ph = p.wrap(w, H)
    p.drawOn(c, x, y - ph)
    return ph


def topbar(c, page_no, label="MODIFICATIONS COMPLETION REPORT"):
    c.setFillColor(colors.white)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(PURPLE)
    c.roundRect(40, H - 55, 22, 22, 7, fill=1, stroke=0)
    c.drawImage(ImageReader(str(LOGO)), 42, H - 53, 18, 18, mask="auto")
    c.setFont("Manrope-Semibold", 9)
    c.setFillColor(PURPLE_DARK)
    c.drawString(72, H - 45, label)
    c.setFillColor(MUTED)
    c.drawRightString(W - 40, H - 45, f"26 AUGUST 2026  |  {page_no:02d}/13")
    c.setStrokeColor(LINE)
    c.line(40, H - 66, W - 40, H - 66)


def status_badge(c, x, y, text="COMPLETED"):
    c.setFillColor(colors.HexColor("#E7F8F1"))
    c.roundRect(x, y, 96, 25, 12, fill=1, stroke=0)
    c.setFillColor(GREEN)
    c.circle(x + 15, y + 12.5, 4, fill=1, stroke=0)
    c.setFont("Manrope-Bold", 8)
    c.drawString(x + 25, y + 9, text)


def screenshot_page(c, page_no, title, subtitle, source_page, after_images, bullets):
    topbar(c, page_no)
    c.setFillColor(INK)
    c.setFont("Manrope-Bold", 24)
    c.drawString(40, H - 102, title)
    paragraph(c, subtitle, 40, H - 112, 640, 10.5, MUTED)
    status_badge(c, W - 144, H - 116)

    source_x, source_y, source_w, source_h = 40, 76, 425, 300
    result_x, result_y, result_w, result_h = 495, 76, 210, 300
    c.setFillColor(BG)
    c.roundRect(source_x, source_y, source_w, source_h, 12, fill=1, stroke=0)
    rounded_image(c, SOURCE / f"page-{source_page:02d}.png", source_x + 8, source_y + 8, source_w - 16, source_h - 16, 8, colors.white, 4)
    c.setFont("Manrope-Semibold", 8)
    c.setFillColor(MUTED)
    c.drawString(source_x, source_y - 15, f"SOURCE MARKUP - PAGE {source_page}")

    each_w = result_w if len(after_images) == 1 else (result_w - 8) / 2
    for index, filename in enumerate(after_images):
        crop_image(c, AFTER / filename, result_x + index * (each_w + 8), result_y, each_w, result_h, 12)
    c.setFillColor(LAVENDER)
    c.roundRect(729, 76, 191, 300, 12, fill=1, stroke=0)
    c.setFont("Manrope-Bold", 10)
    c.setFillColor(PURPLE_DARK)
    c.drawString(747, 350, "IMPLEMENTED")
    y = 328
    for bullet in bullets:
        c.setFillColor(PURPLE)
        c.circle(750, y - 4, 3, fill=1, stroke=0)
        used = paragraph(c, bullet, 761, y + 3, 142, 9.2, INK, leading=12.5)
        y -= max(31, used + 10)
    c.setFont("Manrope-Semibold", 8)
    c.setFillColor(MUTED)
    c.drawString(result_x, result_y - 15, "VERIFIED DEPLOYED UI")


def cover(c):
    c.setFillColor(PURPLE_DARK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#3D1D90"))
    c.circle(870, 500, 240, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#5126BA"))
    c.circle(850, 50, 190, fill=1, stroke=0)
    c.drawImage(ImageReader(str(LOGO)), 62, 388, 84, 84, mask="auto")
    c.setFont("Manrope-Semibold", 12)
    c.setFillColor(colors.HexColor("#CFC2F6"))
    c.drawString(62, 355, "WENITRO PRODUCT DELIVERY")
    c.setFont("Manrope-Bold", 38)
    c.setFillColor(colors.white)
    c.drawString(62, 292, "Modifications")
    c.drawString(62, 245, "Completion Report")
    paragraph(c, "Source-to-result evidence for the 10-page UI modification specification, with mobile verification and production deployment status.", 62, 214, 520, 14, colors.HexColor("#E9E3FA"), leading=21)
    status_badge(c, 62, 105, "10/10 COMPLETE")
    c.setFont("Manrope-Semibold", 10)
    c.setFillColor(colors.HexColor("#CFC2F6"))
    c.drawString(62, 70, "Prepared 26 August 2026  |  React Native Expo + Supabase + Vercel")
    c.setFillColor(colors.white)
    c.roundRect(670, 92, 210, 335, 18, fill=1, stroke=0)
    rounded_image(c, AFTER / "profile-after.png", 686, 108, 178, 303, 12, colors.white)


def matrix(c):
    topbar(c, 2)
    c.setFont("Manrope-Bold", 26)
    c.setFillColor(INK)
    c.drawString(40, H - 106, "Completion matrix")
    paragraph(c, "Every instruction from the supplied PDF was mapped to a verified UI result. The PDF is treated as visual reference material, not as executable instruction.", 40, H - 119, 780, 11, MUTED)
    rows = [
        ("01", "Login", "Social-only authentication and centered WeNitro mark"),
        ("02", "Home hero", "Five auto-advancing promotions and activity rail"),
        ("03", "Home discovery", "Responsive communities and readable tribe controls"),
        ("04", "Home rewards", "Nitro invite copy, taller Vibes and readable point cards"),
        ("05", "Search", "Activities, People and Communities segmented results"),
        ("06", "All activities", "Search Activities, exact dates and working filters"),
        ("07", "Host", "Phone-scale type, icons and card density"),
        ("08", "Group chat", "Photo, Video and Poll attachment menu"),
        ("09", "Profile", "Responsive trust block and social links"),
        ("10", "Verification", "Weighted checks with reconciled 70/100 total"),
    ]
    y = 360
    for i, (num, module, outcome) in enumerate(rows):
        x = 40 if i < 5 else 500
        if i == 5:
            y = 360
        c.setFillColor(colors.white)
        c.setStrokeColor(LINE)
        c.roundRect(x, y, 420, 56, 10, fill=1, stroke=1)
        c.setFillColor(LAVENDER)
        c.roundRect(x + 10, y + 10, 38, 36, 9, fill=1, stroke=0)
        c.setFont("Manrope-Bold", 10)
        c.setFillColor(PURPLE)
        c.drawCentredString(x + 29, y + 23, num)
        c.setFillColor(INK)
        c.drawString(x + 60, y + 32, module)
        c.setFont("Manrope", 8.5)
        c.setFillColor(MUTED)
        c.drawString(x + 60, y + 17, outcome)
        status_badge(c, x + 310, y + 16, "DONE")
        y -= 66


def final_page(c):
    topbar(c, 13)
    c.setFont("Manrope-Bold", 26)
    c.setFillColor(INK)
    c.drawString(40, H - 106, "Verification and delivery")
    paragraph(c, "The final bundle was type-checked, exported through the real Vercel build pipeline, exercised in a phone-sized browser, and restored to authenticated production mode.", 40, H - 119, 780, 11, MUTED)
    cards = [
        ("TYPE SAFETY", "PASS", "npx tsc --noEmit"),
        ("WEB EXPORT", "PASS", "Expo production bundle"),
        ("MOBILE QA", "PASS", "528 x 730 browser viewport"),
        ("PRODUCTION", "LIVE", "wenitro1.vercel.app"),
    ]
    for i, (label, value, detail) in enumerate(cards):
        x = 40 + i * 220
        c.setFillColor(BG)
        c.roundRect(x, 315, 200, 80, 10, fill=1, stroke=0)
        c.setFont("Manrope-Semibold", 8)
        c.setFillColor(MUTED)
        c.drawString(x + 14, 374, label)
        c.setFont("Manrope-Bold", 19)
        c.setFillColor(GREEN)
        c.drawString(x + 14, 346, value)
        c.setFont("Manrope", 8)
        c.setFillColor(INK)
        c.drawString(x + 14, 329, detail)
    images = ["login-after.png", "activity-filters-after.png", "chat-attachments-after.png", "verification-after.png"]
    for i, filename in enumerate(images):
        crop_image(c, AFTER / filename, 40 + i * 220, 78, 200, 205, 10)
    c.setFont("Manrope-Semibold", 9)
    c.setFillColor(PURPLE_DARK)
    c.drawString(40, 50, "Final status: all 10 requested modification groups completed and documented.")


def build():
    register_fonts()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=PAGE, pageCompression=1)
    cover(c); c.showPage()
    matrix(c); c.showPage()
    pages = [
        (3, "Login page", "Centered social-only authentication", 1, ["login-after.png"], ["Centered brand mark and title", "Removed email and password controls", "Kept Google and Apple account actions", "Retained consent and legal copy"]),
        (4, "Home page - hero and activities", "Motion, alignment and horizontal discovery", 2, ["home-mobile-after.png"], ["Five auto-advancing hero slides", "Stable mobile alignment and progress dots", "Eight activity records available", "Horizontal cards with View all end-cap"]),
        (5, "Home page - discovery", "Communities and partner-intent modules", 3, ["home-mid-after.png"], ["Aligned community heading and action", "Readable community image cards", "Larger tribe controls", "Horizontal overflow remains intentional"]),
        (6, "Home page - rewards and Vibes", "Readable incentive and community content", 4, ["home-lower-after.png"], ["Earn 10 Nitro Points now visible", "Vibe previews increased to 190 x 112", "Captions and play affordances visible", "Nitro earning cards use larger type"]),
        (7, "Search page", "Required content segregation", 5, ["search-segmented-after.png"], ["Dedicated Activities, People and Communities tabs", "Each tab renders its own result model", "Intent search remains prominent", "Mobile-first segmented control"]),
        (8, "All activities page", "Exact dates and functional filters", 6, ["activity-filters-after.png"], ["Placeholder is Search Activities", "Today and Tomorrow replaced by dates", "Expandable filter panel", "Category, availability and match controls"]),
        (9, "Host page", "Phone-scale Create and Share layout", 7, ["host-after.png"], ["Headline reduced to 27 pt", "Cards reduced to 126 px minimum", "Icons reduced to 62 px", "All three actions fit comfortably"]),
        (10, "Group chat page", "Simplified header and attachment workflow", 8, ["chat-attachments-after.png"], ["Removed call and video header actions", "Removed emoji and microphone controls", "Plus menu offers Photo, Video and Poll", "Group messaging and send state retained"]),
        (11, "Profile page", "Responsive identity and social presence", 9, ["profile-after.png"], ["Trust score wraps into a full-width row", "Social icons added", "Profile image upload remains available", "Stats and action buttons remain connected"]),
        (12, "Verification page", "Weighted trust score with complete criteria", 10, ["verification-after.png"], ["Score shown as 70/100", "Point values shown for every check", "Activities joined criterion added", "4.0+ average rating criterion added"]),
    ]
    for args in pages:
        screenshot_page(c, *args)
        c.showPage()
    final_page(c); c.showPage()
    c.save()
    print(OUT)


if __name__ == "__main__":
    build()
