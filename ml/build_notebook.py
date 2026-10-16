"""Builds the GeneSense handwriting fine-tune notebook (.ipynb) from plain cell sources."""
import json
import sys
from pathlib import Path

cells = []


def md(text):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(keepends=True)})


def code(text):
    cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [],
                  "source": text.strip("\n").splitlines(keepends=True)})


md("""
# GeneSense: fine-tune a model to read prescriptions

This notebook teaches a small vision-language model (**Qwen2.5-VL-3B**) to read a photo of a prescription and return the medicines as JSON, in the same fields GeneSense uses for its medicine schedule (name, strength, amount, times of day, meal, days, note).

**What it does, in order**
1. Installs the tools and connects your Google Drive.
2. Loads your labelled prescriptions (or makes a small fake set in demo mode).
3. Scores the model **before** training, so you know where you started.
4. Fine-tunes it with LoRA (a small add-on, so it fits on a free T4 GPU).
5. Scores it **after** training, saves it to Drive, and lets you try a new photo.

**Before you start**
- **Runtime → Change runtime type → T4 GPU**, then Save.
- Run the cells from top to bottom (Shift + Enter on each).
- Demo mode (on by default) uses fake, printed prescriptions so you can check everything runs. It teaches the model nothing useful about handwriting. For real training, turn it off and add your own data (section 2).

**Privacy:** real prescriptions are health data. Use only photos you have permission to use, and cover or crop out names, phone numbers, addresses and ID numbers before uploading them to Drive. Keep any model you publish **private**.
""")

md("""
## 1. Install and connect Google Drive

Installing takes 2–4 minutes. If the install cell ends with an error, use **Runtime → Restart session** and run it again.
""")

code("""
%%capture
!pip install unsloth
""")

code("""
import torch
assert torch.cuda.is_available(), "No GPU: Runtime → Change runtime type → T4 GPU, then run again."
print("GPU:", torch.cuda.get_device_name(0))

from google.colab import drive
drive.mount("/content/drive")
""")

md("""
## 2. Settings and your data

**Your data in Google Drive** (when `DEMO_MODE = False`):

```
MyDrive/genesense_rx/
    images/          rx_001.jpg, rx_002.jpg, ...
    labels.jsonl     one line per photo
```

Each line of `labels.jsonl` is one prescription, with the correct answer typed out by a person:

```json
{"image": "rx_001.jpg", "medicines": [{"name": "Amlodipine", "strength": "5 mg", "amount": "1 viên", "morning": true, "noon": false, "afternoon": false, "evening": false, "meal": "after", "days": 30, "note": ""}]}
```

- `meal` is `"before"`, `"after"` or `"any"` (as in GeneSense).
- `days` is a number, or `null` when the prescription does not say.
- A medicine with no time of day ticked means "khi cần" (when needed).
- Aim for **several hundred** prescriptions for useful results; a few dozen only checks the pipeline. Keep about 15% aside for testing (the notebook does this for you).
""")

code("""
DEMO_MODE = True                     # True = fake printed prescriptions, only to check the notebook runs
DATA_DIR = "/content/drive/MyDrive/genesense_rx"
OUTPUT_DIR = "/content/drive/MyDrive/genesense_rx_model"   # the trained add-on is saved here

BASE_MODEL = "unsloth/Qwen2.5-VL-3B-Instruct-bnb-4bit"
EPOCHS = 1 if DEMO_MODE else 3       # passes over the training set
MAX_IMAGE_SIDE = 896                 # bigger = sharper but slower and more GPU memory
TEST_SHARE = 0.15                    # share of prescriptions kept aside for scoring
SEED = 3407
""")

md("""
## 3. Demo data (only runs in demo mode)

Makes 60 fake prescriptions with printed text, slight rotation and noise. Real handwriting is much harder; this only proves the pipeline works end to end.
""")

code("""
import json, os, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import matplotlib

def make_demo_data(folder, count=60):
    random.seed(SEED)
    font_path = Path(matplotlib.get_data_path()) / "fonts/ttf/DejaVuSans.ttf"   # has Vietnamese letters
    font = ImageFont.truetype(str(font_path), 30)
    catalog = [("Amlodipine", "5 mg"), ("Metformin", "500 mg"), ("Losartan", "50 mg"), ("Atorvastatin", "20 mg"),
               ("Paracetamol", "500 mg"), ("Bisoprolol", "2,5 mg"), ("Gliclazide", "30 mg"), ("Aspirin", "81 mg")]
    slots = [("morning", "Sáng"), ("noon", "Trưa"), ("afternoon", "Chiều"), ("evening", "Tối")]
    meals = {"before": "trước ăn", "after": "sau ăn", "any": ""}
    (folder / "images").mkdir(parents=True, exist_ok=True)
    with open(folder / "labels.jsonl", "w", encoding="utf-8") as out:
        for i in range(count):
            image = Image.new("RGB", (900, 700), (250, 248, 240))
            draw = ImageDraw.Draw(image)
            draw.text((40, 30), "ĐƠN THUỐC", font=font, fill=(20, 20, 20))
            medicines, y = [], 100
            for n, (name, strength) in enumerate(random.sample(catalog, random.randint(1, 4)), 1):
                ticked = {key: random.random() < 0.4 for key, _ in slots}
                meal = random.choice(list(meals))
                days = random.choice([7, 10, 14, 30, None])
                when = ", ".join(label for key, label in slots if ticked[key]) or "Khi cần"
                line = f"{n}. {name} {strength} - 1 viên - {when}"
                extra = ", ".join(x for x in [meals[meal], f"{days} ngày" if days else ""] if x)
                draw.text((40, y), line, font=font, fill=(10, 30, 90))
                draw.text((80, y + 40), extra, font=font, fill=(10, 30, 90))
                y += 110
                medicines.append({"name": name, "strength": strength, "amount": "1 viên", **ticked,
                                  "meal": meal, "days": days, "note": ""})
            image = image.rotate(random.uniform(-3, 3), expand=True, fillcolor=(250, 248, 240))
            image = image.filter(ImageFilter.GaussianBlur(random.uniform(0, 1.2)))
            file = f"demo_{i:03d}.jpg"
            image.save(folder / "images" / file, quality=85)
            out.write(json.dumps({"image": file, "medicines": medicines}, ensure_ascii=False) + "\\n")

if DEMO_MODE:
    DATA_DIR = "/content/demo_rx"
    make_demo_data(Path(DATA_DIR))
    print("Demo data written to", DATA_DIR)
""")

md("""
## 4. Load, check and split the data

Stops with a clear message if a photo is missing or a label has the wrong shape, so you can fix `labels.jsonl` first.
""")

code("""
FIELDS = ["name", "strength", "amount", "morning", "noon", "afternoon", "evening", "meal", "days", "note"]

def load_records(folder):
    folder, records, problems = Path(folder), [], []
    for number, line in enumerate(open(folder / "labels.jsonl", encoding="utf-8"), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as error:
            problems.append(f"line {number}: not valid JSON ({error})"); continue
        path = folder / "images" / str(row.get("image", ""))
        if not path.is_file():
            problems.append(f"line {number}: photo not found: {path.name}"); continue
        meds = row.get("medicines")
        if not isinstance(meds, list) or not all(isinstance(m, dict) and m.get("name") for m in meds):
            problems.append(f"line {number}: 'medicines' must be a list of objects that each have a 'name'"); continue
        if any(m.get("meal", "any") not in ("before", "after", "any") for m in meds):
            problems.append(f"line {number}: 'meal' must be before, after or any"); continue
        records.append({"path": str(path), "medicines": [{f: m.get(f) for f in FIELDS} for m in meds]})
    if problems:
        raise SystemExit("Fix these in labels.jsonl first:\\n" + "\\n".join(problems[:20]))
    return records

records = load_records(DATA_DIR)
random.Random(SEED).shuffle(records)
test_count = max(1, round(len(records) * TEST_SHARE))
test_records, train_records = records[:test_count], records[test_count:]
print(f"{len(records)} prescriptions: {len(train_records)} for training, {len(test_records)} for testing")
if len(records) < 100 and not DEMO_MODE:
    print("Note: under 100 prescriptions is enough to test the pipeline, not to train a reliable model.")
""")

code("""
def load_image(path):
    image = Image.open(path).convert("RGB")
    image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))   # keeps the aspect ratio
    return image

display(load_image(train_records[0]["path"]))
print(json.dumps(train_records[0]["medicines"], ensure_ascii=False, indent=1))
""")

md("""
## 5. The instruction the model gets

The same instruction is used for training, scoring and later in GeneSense, so the answers keep one shape.
""")

code("""
PROMPT = (
    "Đọc đơn thuốc trong ảnh. Chỉ trả về JSON, không giải thích, theo đúng dạng:\\n"
    '{"medicines": [{"name": "", "strength": "", "amount": "", "morning": false, "noon": false, '
    '"afternoon": false, "evening": false, "meal": "any", "days": null, "note": ""}]}\\n'
    "meal là before (trước ăn), after (sau ăn) hoặc any. days là số ngày dùng, hoặc null nếu đơn không ghi. "
    "Thuốc dùng khi cần thì để cả bốn buổi là false. Không đoán: chữ nào không đọc được thì ghi vào note."
)

def to_sample(record):
    answer = json.dumps({"medicines": record["medicines"]}, ensure_ascii=False)
    return {"messages": [
        {"role": "user", "content": [{"type": "image", "image": load_image(record["path"])},
                                     {"type": "text", "text": PROMPT}]},
        {"role": "assistant", "content": [{"type": "text", "text": answer}]},
    ]}

train_samples = [to_sample(r) for r in train_records]
print(len(train_samples), "training samples ready")
""")

md("""
## 6. Load the model

Downloads Qwen2.5-VL-3B in 4-bit (about 3 GB) and adds the LoRA layers that training will change.
""")

code("""
from unsloth import FastVisionModel, is_bf16_supported

model, tokenizer = FastVisionModel.from_pretrained(BASE_MODEL, load_in_4bit=True,
                                                   use_gradient_checkpointing="unsloth")
model = FastVisionModel.get_peft_model(
    model,
    finetune_vision_layers=True,      # learns to see handwriting better
    finetune_language_layers=True,    # learns the JSON shape and medicine names
    finetune_attention_modules=True,
    finetune_mlp_modules=True,
    r=16, lora_alpha=16, lora_dropout=0, bias="none", random_state=SEED,
)
""")

md("""
## 7. Scoring

Compares the model's answers with your typed-out answers:
- **Valid JSON:** answers the app could read at all.
- **Medicine names (precision / recall / F1):** found the right medicines, without inventing or missing any. Names match even with small spelling slips.
- **Field accuracy:** strength, amount, times of day, meal and days, for the medicines it found.
- **Fully correct:** prescriptions where every medicine and every field is right. This is the number that matters most for a medicine schedule.
""")

code("""
import difflib, re, unicodedata

def norm(value):
    text = unicodedata.normalize("NFKD", str("" if value is None else value)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()

def parse_answer(text):
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    for candidate in (text, (re.search(r"\\{.*\\}", text, re.S) or [None])[0]):
        if not candidate:
            continue
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        meds = data.get("medicines") if isinstance(data, dict) else None
        if isinstance(meds, list):
            return [m for m in meds if isinstance(m, dict)]
    return None

CHECKED = ["strength", "amount", "morning", "noon", "afternoon", "evening", "meal", "days"]

def score(pairs):
    \"\"\"pairs: list of (correct medicines, predicted medicines or None).\"\"\"
    tp = fp = fn = valid = perfect = field_ok = field_all = 0
    for truth, pred in pairs:
        if pred is None:
            fn += len(truth); continue
        valid += 1
        left, all_ok = list(pred), len(pred) == len(truth)
        for t in truth:
            ratio = lambda p: difflib.SequenceMatcher(None, norm(t["name"]), norm(p.get("name"))).ratio()
            best = max(left, key=ratio, default=None)
            if best is None or ratio(best) < 0.85:
                fn += 1; all_ok = False; continue
            tp += 1; left.remove(best)
            for field in CHECKED:
                ok = norm(t.get(field)) == norm(best.get(field))
                field_all += 1; field_ok += ok; all_ok &= ok
        fp += len(left); all_ok &= not left
        perfect += all_ok
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    return {"valid JSON": valid / len(pairs), "names precision": precision, "names recall": recall,
            "names F1": 2 * precision * recall / (precision + recall) if precision + recall else 0,
            "field accuracy": field_ok / field_all if field_all else 0, "fully correct": perfect / len(pairs)}

def read_prescription(image):
    messages = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": PROMPT}]}]
    text = tokenizer.apply_chat_template(messages, add_generation_prompt=True)
    inputs = tokenizer(image, text, add_special_tokens=False, return_tensors="pt").to("cuda")
    output = model.generate(**inputs, max_new_tokens=768, use_cache=True, do_sample=False)
    return tokenizer.decode(output[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)

def evaluate(records, label):
    FastVisionModel.for_inference(model)
    pairs = [(r["medicines"], parse_answer(read_prescription(load_image(r["path"])))) for r in records]
    result = score(pairs)
    print(label)
    for name, value in result.items():
        print(f"  {name:16} {value:6.1%}")
    return result
""")

code("""
before = evaluate(test_records, "Before training:")
""")

md("""
## 8. Train

On a T4, expect roughly **1–3 minutes per 100 prescriptions per epoch**. Keep the tab open: Colab disconnects idle sessions, and the free tier ends sessions after a few hours. The loss printed every few steps should go down.
""")

code("""
from trl import SFTTrainer, SFTConfig
from unsloth.trainer import UnslothVisionDataCollator

import inspect

# Newer TRL versions renamed two settings; pick whichever this install understands.
config_params = inspect.signature(SFTConfig.__init__).parameters
trainer_params = inspect.signature(SFTTrainer.__init__).parameters
length_arg = {"max_length" if "max_length" in config_params else "max_seq_length": 2048}
tokenizer_arg = {"processing_class" if "processing_class" in trainer_params else "tokenizer": tokenizer}

FastVisionModel.for_training(model)
trainer = SFTTrainer(
    model=model,
    **tokenizer_arg,
    data_collator=UnslothVisionDataCollator(model, tokenizer),
    train_dataset=train_samples,
    args=SFTConfig(
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        num_train_epochs=EPOCHS,
        learning_rate=2e-4,
        warmup_steps=5,
        lr_scheduler_type="linear",
        optim="adamw_8bit",
        weight_decay=0.01,
        fp16=not is_bf16_supported(),
        bf16=is_bf16_supported(),
        logging_steps=5,
        seed=SEED,
        output_dir="/content/checkpoints",
        report_to="none",
        remove_unused_columns=False,
        dataset_text_field="",
        dataset_kwargs={"skip_prepare_dataset": True},
        **length_arg,
    ),
)
trainer.train()
""")

code("""
after = evaluate(test_records, "After training:")
print("\\nChange in 'fully correct':", f"{after['fully correct'] - before['fully correct']:+.1%}")
""")

md("""
## 9. Save

Saves only the LoRA add-on (tens of MB) to your Drive. Loading it later needs the same base model.
""")

code("""
model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)
json.dump({"base_model": BASE_MODEL, "prompt": PROMPT, "before": before, "after": after,
           "train": len(train_records), "test": len(test_records), "demo": DEMO_MODE},
          open(f"{OUTPUT_DIR}/run_info.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("Saved to", OUTPUT_DIR)
""")

md("""
**Optional: upload to Hugging Face as a private model** (needed later for hosting). Create a token at huggingface.co → Settings → Access Tokens (type *Write*), add it in Colab's **Secrets** panel (key icon on the left) as `HF_TOKEN`, then run the next cell. Never paste the token into a cell.
""")

code("""
PUSH_TO_HUB = False
HUB_REPO = "your-username/genesense-rx-reader"   # change this

if PUSH_TO_HUB:
    from google.colab import userdata
    from huggingface_hub import create_repo
    token = userdata.get("HF_TOKEN")
    create_repo(HUB_REPO, private=True, exist_ok=True, token=token)
    model.push_to_hub(HUB_REPO, token=token)
    tokenizer.push_to_hub(HUB_REPO, token=token)
    print("Uploaded (private):", HUB_REPO)
""")

md("""
## 10. Try a new photo

Upload one prescription photo the model has never seen. The result is a starting point to check, never a final answer: in GeneSense it must keep going through the "kiểm tra trước khi lưu" review step.
""")

code("""
from google.colab import files
import io

uploaded = files.upload()
for name, content in uploaded.items():
    image = load_image(io.BytesIO(content))
    display(image)
    FastVisionModel.for_inference(model)
    answer = read_prescription(image)
    meds = parse_answer(answer)
    print(json.dumps(meds, ensure_ascii=False, indent=1) if meds is not None else "Could not read JSON:\\n" + answer)
""")

md("""
## 11. Optional: score Gemini (or any other model) on the same test set

Shows whether training was worth it. Save the other model's answers for the **same test photos** as a `.jsonl` file, one line per photo: `{"image": "rx_001.jpg", "medicines": [...]}`. Upload it to Drive and set the path below.
""")

code("""
OTHER_PREDICTIONS = ""   # e.g. "/content/drive/MyDrive/genesense_rx/gemini_predictions.jsonl"

if OTHER_PREDICTIONS:
    other = {}
    for line in open(OTHER_PREDICTIONS, encoding="utf-8"):
        if line.strip():
            row = json.loads(line)
            other[row["image"]] = row.get("medicines")
    pairs = [(r["medicines"], other.get(Path(r["path"]).name)) for r in test_records]
    for name, value in score(pairs).items():
        print(f"  {name:16} {value:6.1%}")
""")

md("""
## Next steps (outside this notebook)

- **Hosting:** GeneSense's backend runs on Vercel, which cannot run this model (no GPU). Host it on a GPU service (for example a Hugging Face Inference Endpoint or Modal) and have the backend call it the way it calls Gemini today, behind the same review step.
- **When to use it:** only if it beats Gemini on the same test set (section 11), especially on "fully correct".
- **More data helps most:** labelling more real prescriptions usually improves results more than changing settings.
""")

notebook = {
    "cells": cells,
    "metadata": {
        "accelerator": "GPU",
        "colab": {"provenance": [], "gpuType": "T4"},
        "kernelspec": {"display_name": "Python 3", "name": "python3"},
        "language_info": {"name": "python"},
    },
    "nbformat": 4,
    "nbformat_minor": 0,
}
target = Path(sys.argv[1])
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(notebook, ensure_ascii=False, indent=1), encoding="utf-8")
print("written", target, len(cells), "cells")
