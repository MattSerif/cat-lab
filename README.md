# Cat Lab

A low-poly 3D cat shaped by sliders. Head slider ranges come from the landmark files of 9,997 annotated cats, and coats are sampled from the same cats' photos. The dataset only covers heads, so the body, leg and tail sliders use typical ranges from general cat anatomy.

```bash
npm install
```

```bash
npm run dev
```

## Using it

- Drag to turn the cat, and scroll or pinch to zoom. The view follows the cat as it changes shape. RESET and RANDOM CAT zoom to fit it.
- On FACE and EARS sliders, the shaded band is the real range of cats in the dataset, and the rest of the track, about 1.75x wider, is there for silly results.
- BODY, LEGS and TAIL sliders are marked ESTIMATED. Their hatched band is a typical range for domestic cats, from general anatomy rather than measurements, and they have no histogram.
- A coat button applies a random real coat from that category. The percentage is that category's share of the cats sorted by rule. PICKED means a hand-checked set, so it has no percentage.
- RANDOM in the COAT section changes only the coat. RANDOM CAT picks a real cat's head shape and a real coat. Its body is drawn from inside the typical bands, favouring the middle.
- The COAT picker switches to a solid custom colour, and EYES sets the eye colour.
- SAVE writes a 2048 px PNG with a transparent background.

## How it works

Raw data stays in `datasets/` and never reaches the browser. `pipeline/build_model.py` reduces it to `src/data/model.json` (about 57 KB):

| Part | Contents |
| --- | --- |
| Sliders | Range, real range, default and histogram for 9 measurements |
| Samples | 500 real cats' measurements, for RANDOM CAT |
| Categories | Up to 60 real coats per category, 8 colours each |

The cat has 423 triangles: 107 in the head and 316 in the body, including 44 tabby mark triangles that only draw on tabby coats. The 9 dataset points set the eyes, mouth and ears, and the rest of the head follows from them. The dataset has no depth, cheek or chin points, so those are invented.

All lengths are in head widths. The body is a six-sided torso that runs from chest to rump, with a neck that rises forward to carry the head. It stands on four legs of three segments each, with bent hind legs and wedge paws, and ends in a six-segment tail that bends a little more at each segment. Head tilt rolls the head about the top of the neck.

The body takes its colours from the head's sampled regions:

| Body part | Coat region |
| --- | --- |
| Back, top of neck, tail | Forehead |
| Sides, upper legs | Left or right cheek |
| Chest, belly, throat | Chin |
| Lower legs, paws | Muzzle, so white muzzles give white socks |
| Tail tip | Ear |

Tabby coats also get stripes across the back and rings on the tail.

### Sliders

Each cat is rotated so its eyes are level, centred on the eye midpoint and scaled to a head width of 1. Shape sliders use the 7,981 cats facing the camera. Head tilt uses every cat.

Much of the variation in Eye height is head pitch rather than anatomy, because the dataset's cats are photographed from many angles.

### Coats

`pipeline/coats.py` uses each cat's landmarks to sample 8 face regions, and left and right stay separate. It uses camera-facing cats with large enough faces, which leaves 6,550 coats. These categories come from coarse colour rules based on general cat coat knowledge, so a label can be wrong:

| Category | How it is sorted |
| --- | --- |
| Black, White, Grey, Ginger, Cream, Brown Tabby | Colour and contrast rules |
| Tuxedo, Bicolour | Rules on where dark and white regions sit |
| Calico/Tortie, Colourpoint | Checked by eye, listed in `pipeline/curated.json` |

Calico patches look too much like tabby stripes in shadow for colour rules to separate them, and colourpoints were too easy to confuse with calicos. `pipeline/curate_sheet.py` makes numbered candidate sheets for those two, and the picks are stored as filenames. 3,377 sampled cats fit no rule clearly and are left out.

Not measured from the photos:

- Tabby stripes are too fine for 8 regions, so Brown Tabby adds a hand-drawn forehead M, back stripes and tail rings.
- Body colours reuse head regions, so a cat's real body markings are not captured.
- Eye colour comes from a short hand-written list, with blue for colourpoints.
- The inner ear and nose are tinted pink.

## Rebuilding the model

`pipeline/measurements.json.gz` (about 410 KB) holds every number the model is fitted from, with no photos, so the raw dataset can be deleted and the model can still be refit:

```bash
pip3 install -r pipeline/requirements.txt
```

```bash
npm run model
```

To read the raw dataset again, put it at `datasets/Cat Dataset/` and run:

```bash
npm run model:scan
```

That takes about 25 seconds. With the raw photos present, both commands write `pipeline/out/coats_qc.jpg`, a sheet of photos beside their sampled swatches for checking categories.

The app never reads `datasets/` or `pipeline/`, and it runs and builds without them.

## About the dataset

The `cats/` folder is not a set of crops. Every image and `.cat` file in it is byte-identical to the top-level `CAT_0x` copy, so the pipeline ignores it.

Each `.cat` file holds `9` followed by 18 integers: left eye, right eye, mouth, then outer base, tip and inner base for each ear, with the right ear in reverse order. Coordinates can be negative when an ear tip is outside the photo, and those are kept.

Data: [Cat Dataset on Kaggle](https://www.kaggle.com/datasets/crawford/cat-dataset).
