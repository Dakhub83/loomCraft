# Hoodie catalog

Reference for the hoodie options in LoomCraft: every major closure, silhouette, sleeve/functional variation and fabric for men's, women's and unisex hoodies. The same entries are available as seed data in [`src/data/hoodieCatalog.json`](../src/data/hoodieCatalog.json), validated by [`src/data/hoodieCatalog.schema.json`](../src/data/hoodieCatalog.schema.json). The JSON is the source of truth for the app; keep this guide in sync when it changes.

## How the catalog is organised

- **Four independent dimensions.** `sub_category` is Closure, Silhouette, Functional/Sleeve or Fabric. A product combines one choice from each (for example: Full-Zip + Boxy + Raglan + Heavyweight Brushed Fleece), so the catalog lists each concept once instead of every combination.
- **Gender.** `gender_category` is `Men`, `Women` or `Unisex`. Unisex entries apply to every audience; filter a dropdown with `gender_category ∈ {selected, "Unisex"}`.
- **IDs** are slugs prefixed with the gender (`mens-`, `womens-`, `unisex-`) and are stable keys: never reuse one for a different concept.
- **Recommended GSM** is the typical body-fabric weight for that style (grams per square metre). A trailing `+` means heavier weights are common. For the Fabric entries it is the weight range of the fabric itself.

**42 entries**: 10 Closure, 16 Silhouette, 8 Functional/Sleeve, 8 Fabric.

## Contents

- [Closure & front construction](#closure--front-construction)
- [Fit & silhouette: men's and unisex](#fit--silhouette-mens-and-unisex)
- [Fit & silhouette: women's](#fit--silhouette-womens)
- [Sleeve & functional variations](#sleeve--functional-variations)
- [Fabric & knit types](#fabric--knit-types)

## Closure & front construction

| Name | ID | Gender | Description | Key design features | Recommended GSM |
|---|---|---|---|---|---|
| **Pullover Hoodie** | `unisex-pullover` | Unisex | A closed-front hooded sweatshirt pulled on over the head, with an unbroken front panel and a single pouch pocket. | uninterrupted front panel, kangaroo pocket, drawstring hood, ribbed cuffs and hem | 280–450 GSM |
| **Full-Zip Hoodie** | `unisex-full-zip` | Unisex | A hooded sweatshirt opening fully down the centre front on a separating zip from hem to neckline. | centre-front separating zip, split kangaroo pockets, zip garage at neck, drawstring hood | 280–450 GSM |
| **Half-Zip Hoodie** | `unisex-half-zip` | Unisex | A pullover hoodie with a 10–12 in non-separating zip running from the neckline to mid-chest. | mid-chest zip placket, non-separating zip, kangaroo pocket, ribbed hem | 260–400 GSM |
| **Quarter-Zip Hoodie** | `unisex-quarter-zip` | Unisex | A pullover hoodie with a short 6–8 in neck zip that opens the collar without splitting the chest. | short neck zip, zip guard at chin, pullover body, ribbed cuffs | 240–380 GSM |
| **Two-Way Zip Hoodie (Double-Zip)** | `unisex-two-way-zip` | Unisex | A full-zip hoodie on a two-way separating zip with sliders at both ends, so it can open from the hem for sitting or layering. | two-way separating zip, dual sliders, split welt pockets, drawstring hood | 300–450 GSM |
| **Asymmetric Zip Hoodie** | `unisex-asymmetric-zip` | Unisex | A hoodie whose front zip runs on an off-centre diagonal from the hem to one side of a high collar. | off-centre diagonal zip, overlapping front panels, high wrap collar, zip chest pocket | 300–450 GSM |
| **Snap-Front / Button-Front Hoodie** | `unisex-snap-front` | Unisex | A hooded sweatshirt that opens down a centre-front placket fastened with metal snaps or buttons instead of a zip. | front placket, metal snaps or buttons, patch pockets, lined hood | 300–450 GSM |
| **Lace-Up Baja Hoodie** | `unisex-baja` | Unisex | A pullover hoodie in woven striped jacquard with a V-neck closed by cord lacing through eyelets. | lace-up V-neck, woven jacquard stripes, kangaroo pocket, unlined hood | 300–400 GSM |
| **Cross-Neck Hoodie (Crossover Neck)** | `womens-cross-neck` | Women | A pullover hoodie whose two front neck panels overlap in a crossover V below a drawstring-free hood. | overlapping crossover neckline, no drawstring, fitted hood, ribbed cuffs | 220–350 GSM |
| **Funnel-Neck / Cowl-Neck Hoodie** | `unisex-funnel-neck` | Unisex | A pullover with a tall stand-up funnel collar that rises directly into the hood and can be worn up to cover the chin. | tall funnel collar, hood rises from collar, toggle drawcord, no front opening | 320–450 GSM |

## Fit & silhouette: men's and unisex

| Name | ID | Gender | Description | Key design features | Recommended GSM |
|---|---|---|---|---|---|
| **Regular / Classic Fit Hoodie** | `unisex-regular-fit` | Unisex | A straight-cut hoodie with set-in shoulders at the natural shoulder point, moderate chest ease and a hip-length ribbed hem. | straight body, natural shoulder line, hip-length hem, moderate ease | 280–400 GSM |
| **Slim / Athletic Fit Hoodie** | `mens-slim-fit` | Men | A close-fitting hoodie cut narrow through the chest, waist and sleeves, usually with stretch, for a trim athletic line. | narrow body, slim sleeves, stretch knit, fitted hood | 220–330 GSM |
| **Oversized Hoodie** | `unisex-oversized` | Unisex | A deliberately roomy hoodie with generous chest ease, dropped shoulders, long sleeves that stack at the cuff and an oversized hood. | generous chest ease, dropped shoulders, stacked long sleeves, oversized hood | 380–500 GSM |
| **Drop-Shoulder Hoodie** | `unisex-drop-shoulder` | Unisex | A hoodie whose shoulder seam sits 2–4 in down the upper arm, giving a relaxed sloping shoulder with a regular-length body. | dropped shoulder seam, relaxed armhole, regular length, kangaroo pocket | 350–480 GSM |
| **Boxy Hoodie** | `mens-boxy` | Men | A wide, short and square hoodie with the same width from chest to hem, a cropped-to-hip length and a structured heavyweight drape. | square silhouette, wide straight hem, shortened body length, double-lined hood | 400–550+ GSM |
| **Longline Hoodie** | `mens-longline` | Men | An elongated hoodie that extends to mid-thigh, often with a curved drop hem and side splits. | extended body length, curved drop hem, side splits, slim sleeves | 260–380 GSM |
| **Muscle / Tapered Fit Hoodie** | `mens-muscle-tapered` | Men | A hoodie cut fuller through the chest and shoulders and tapering sharply to a fitted waist, with snug sleeves that show the arms. | fuller chest, tapered waist, snug sleeves, short cuffs | 240–340 GSM |

## Fit & silhouette: women's

| Name | ID | Gender | Description | Key design features | Recommended GSM |
|---|---|---|---|---|---|
| **Micro-Crop Hoodie** | `womens-micro-crop` | Women | An extreme crop ending just below the bust, with a raw or narrow banded hem. | hem below bust, raw or narrow band hem, boxy upper body, drawstring hood | 220–320 GSM |
| **Waist-Length Cropped Hoodie** | `womens-waist-crop` | Women | A hoodie cropped to the natural waist so it meets high-rise bottoms, finished with a ribbed or drawcord hem. | natural-waist length, ribbed or drawcord hem, relaxed body, kangaroo pocket | 260–380 GSM |
| **Boyfriend Fit Hoodie** | `womens-boyfriend` | Women | A relaxed women's hoodie borrowed from menswear proportions: wider body, dropped shoulders and longer sleeves. | menswear proportions, dropped shoulders, longer sleeves, relaxed hip-length body | 320–450 GSM |
| **Fitted / Sculpted Hoodie** | `womens-fitted-sculpted` | Women | A body-skimming women's hoodie with princess or side shaping seams that follow the bust, waist and hip. | princess or shaping seams, defined waist, stretch knit, slim sleeves | 220–320 GSM |
| **Hoodie Dress / Tunic Hoodie** | `womens-hoodie-dress` | Women | A hoodie extended to tunic or mini-dress length, ending between the upper thigh and the knee. | thigh-to-knee length, optional waist drawcord, side splits, kangaroo pocket | 240–360 GSM |
| **Dolman / Batwing Sleeve Hoodie** | `womens-dolman` | Women | A hoodie whose sleeves are cut in one with the body, forming a deep armhole that drops to the waist and tapers to a fitted cuff. | cut-in-one sleeves, deep armhole to waist, tapered fitted cuffs, relaxed upper body | 220–320 GSM |
| **Wrap / Ruched-Front Hoodie** | `womens-wrap-ruched` | Women | A hoodie whose front is wrapped across the body or gathered in ruching at the side or centre front to shape the waist. | wrap or overlapping front, gathered ruching, side tie or drawcord, waist definition | 200–300 GSM |
| **High-Low Hem Hoodie** | `womens-high-low` | Women | A hoodie with a hem that is shorter at the front and drops longer at the back, often with side splits. | shorter front hem, dropped back hem, side splits, curved hemline | 240–340 GSM |
| **Off-the-Shoulder Hoodie** | `womens-off-shoulder` | Women | A hoodie with a wide slash or boat neckline that slips off one or both shoulders, with the hood attached at the back neck. | wide slash neckline, exposed shoulder, back-set hood, relaxed body | 200–300 GSM |

## Sleeve & functional variations

| Name | ID | Gender | Description | Key design features | Recommended GSM |
|---|---|---|---|---|---|
| **Set-In Sleeve Hoodie** | `unisex-set-in-sleeve` | Unisex | A long-sleeve hoodie whose sleeves are sewn into a rounded armhole at the shoulder point, giving a tailored shoulder line. | armhole seam at shoulder point, shaped sleeve cap, tailored shoulder, ribbed cuffs | 260–450 GSM |
| **Raglan Sleeve Hoodie** | `unisex-raglan-sleeve` | Unisex | A long-sleeve hoodie whose sleeves run in one piece diagonally from the underarm to the collar, with no shoulder seam. | diagonal raglan seams, no shoulder seam, wide range of movement, contrast sleeve option | 260–400 GSM |
| **Short-Sleeve Hoodie** | `unisex-short-sleeve` | Unisex | A hoodie with tee-length short sleeves ending at mid-bicep, for warm weather or layering. | mid-bicep sleeves, hemmed or ribbed sleeve ends, lightweight body, drawstring hood | 200–300 GSM |
| **Sleeveless / Cutoff Hoodie** | `unisex-sleeveless` | Unisex | A hoodie with the sleeves removed, leaving deep or raw-edged armholes, typically for training. | deep armholes, raw or bound arm edges, dropped side panels, drawstring hood | 220–330 GSM |
| **Thumbhole Cuff Hoodie** | `unisex-thumbhole` | Unisex | A hoodie with extended cuffs that have a thumb opening, so the sleeves stay over the back of the hand. | extended cuffs, thumb openings, hand coverage, slim sleeves | 220–330 GSM |
| **Tech / Utility Hoodie** | `unisex-tech-utility` | Unisex | A performance hoodie with bonded or taped seams, zip-secured pockets and technical trims such as reflective details. | taped or bonded seams, zip-secured pockets, reflective details, adjustable hood | 280–380 GSM |
| **Balaclava / Ninja Hood Hoodie** | `unisex-balaclava` | Unisex | A hoodie with an extended hood that wraps the neck and lower face, leaving an eye opening or a zip-down face panel. | face-covering hood, eye opening or zip mask, wrapped neck, fitted crown | 300–450 GSM |
| **Double-Lined Hood Hoodie (No Drawstring)** | `unisex-double-lined-hood` | Unisex | A hoodie with a two-layer, self-lined hood that holds its shape without a drawstring. | two-layer self-lined hood, no drawstring or eyelets, structured hood shape, clean neckline | 350–500 GSM |

## Fabric & knit types

| Name | ID | Gender | Description | Key design features | Recommended GSM |
|---|---|---|---|---|---|
| **Lightweight Jersey** | `unisex-lightweight-jersey` | Unisex | A smooth, single-faced knit with a flat face and light drape, used for summer and layering hoodies. | single jersey knit, smooth flat face, light drape, minimal shrinkage when pre-shrunk | 180–260 GSM |
| **French Terry** | `unisex-french-terry` | Unisex | A knit with a smooth face and unbrushed looped back, giving a breathable, mid-weight, all-season hand. | smooth face, looped unbrushed back, breathable, mid-weight drape | 280–380 GSM |
| **Heavyweight Brushed Fleece** | `unisex-brushed-fleece` | Unisex | A dense loopback knit whose back has been brushed into a soft, warm nap, giving a thick structured hoodie body. | brushed napped back, dense structured body, high warmth, minimal drape | 400–550+ GSM |
| **Tech Fleece (Bonded Spacer)** | `unisex-tech-fleece` | Unisex | A spacer-knit fabric that traps air between two bonded faces, giving warmth without bulk and a smooth sculpted surface. | double-face spacer construction, smooth outer face, lightweight warmth, clean bonded edges | 300–420 GSM |
| **Sherpa / Borg** | `unisex-sherpa-borg` | Unisex | A high-pile fleece imitating shearling, used as a full shell or as a hood and body lining. | high-pile curly face, shearling look, very high warmth, often a contrast lining | 300–500 GSM |
| **Waffle / Thermal Knit** | `unisex-waffle-thermal` | Unisex | A knit with a raised square-grid texture whose pockets trap warm air while staying breathable. | raised waffle grid, air-trapping texture, breathable, light-to-mid weight | 200–320 GSM |
| **Cable / Sweater Knit** | `unisex-cable-sweater-knit` | Unisex | A flat- or circular-knit yarn construction with cable or rib patterns, giving a sweater hoodie with visible stitch texture. | visible stitch texture, cable or rib patterns, fully fashioned panels, knitted-in trims | 350–550 GSM |
| **Velour / Terry Cloth** | `unisex-velour-terry-cloth` | Unisex | A plush pile fabric: velour has a cut pile with a soft sheen, while terry cloth has an uncut looped pile on the face. | plush pile face, cut pile with sheen (velour), looped towelling pile (terry), soft drape | 280–400 GSM |

## JSON shape

Each item in `items` has exactly these fields:

```json
{
  "id": "unisex-pullover",
  "name": "Pullover Hoodie",
  "gender_category": "Unisex",
  "sub_category": "Closure",
  "description": "A closed-front hooded sweatshirt pulled on over the head, with an unbroken front panel and a single pouch pocket.",
  "key_design_features": [
    "uninterrupted front panel",
    "kangaroo pocket",
    "drawstring hood",
    "ribbed cuffs and hem"
  ],
  "recommended_gsm": {
    "min": 280,
    "max": 450,
    "display": "280–450 GSM"
  }
}
```
