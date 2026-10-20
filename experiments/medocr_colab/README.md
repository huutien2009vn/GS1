# GeneSense × MedOCR-Vision Colab fine-tuning

This experiment starts from the open MedOCR-Vision checkpoint and adds a small LoRA adapter for your document style/language. The notebook compares the same held-out images before and after training and exports per-image CER/WER evidence plus the adapter. It does not change the GeneSense production app.

## Before uploading anything

Use only images you own or are authorized to process. Remove or mask patient names, phone numbers, addresses, IDs, barcodes/QR codes, and other identifying details from both image and transcription. Google Colab runs on a Google-managed machine; do not upload identifiable medical records unless your authorization and privacy/security requirements explicitly permit that. The notebook stops until you set `DATA_DEIDENTIFIED = True` yourself.

Do not use the public MedOCR dataset as-is: its card describes mixed-source data, and some visible rows contain patient-identifying text. Review the source and license of every sample before using it. The checkpoint's MIT license does not automatically license all source datasets.

## Prepare the 100-image bundle

Make a ZIP with this layout:

```text
genesense_medocr_100.zip
├── manifest.csv
└── images/
    ├── scan_001.jpg
    ├── scan_002.png
    └── ...
```

`manifest.csv` must be UTF-8 CSV with these columns:

| filename | split | group_id | text |
| --- | --- | --- | --- |
| scan_001.jpg | train | template_a | Exact transcription for this image |
| scan_002.png | validation | template_b | Exact transcription for this image |
| scan_003.jpg | test | template_c | Exact transcription for this image |

- `split` is one of `train`, `validation`, `test`. For 100 images, use approximately **70 / 15 / 15**.
- Keep the test split untouched until the final comparison. Never tune prompts or hyperparameters against test results.
- `group_id` is an anonymous grouping label (for example, document template/source or patient pseudonym). A group must occur in only one split so near-duplicate layouts do not leak across train/test. Do not put names or identifiers here.
- `text` is the complete visible text, transcribed faithfully. Keep spelling, numbers, units, punctuation, and line order; do not correct medical content.
- Use JPG, JPEG, or PNG. Filenames must be unique. Do not include originals with identifying details.

Copy the blank header-only `manifest_template.csv` as `manifest.csv`, fill in the rows, and place the corresponding images under `images/`.

## Run in Colab

1. Upload `medocr_100_colab.ipynb` to Google Colab and select **Runtime → Change runtime type → GPU**.
2. Run cells from top to bottom. The GPU check reports actual hardware and stops if no CUDA GPU is attached.
3. Upload the ZIP when prompted. Set `DATA_DEIDENTIFIED = True` only after reviewing the complete bundle.
4. The notebook checks image files, split counts, duplicate hashes, and group leakage before loading the model.
5. It measures the pretrained checkpoint on test, trains LoRA on train, selects by validation loss, then evaluates the held-out test split once.
6. Download the output ZIP. It contains the adapter and `report.json` / `per_image_results.csv`. These outputs contain transcriptions; keep them private and clear the Colab runtime when finished.

The target is 24 GB VRAM, matching the model card's reported training run. A smaller Colab GPU may work with micro-batch size 1 and 4-bit loading, but can still run out of memory or be unavailable. The experiment measures Vietnamese performance; the model card says its training is primarily English. CER/WER measure OCR transcription similarity only, not medical correctness or safe medication interpretation.

## Evidence produced

- `report.json`: model/revision, GPU, split counts, train runtime, aggregate before/after CER and WER.
- `per_image_results.csv`: one row per held-out image with reference, baseline OCR, tuned OCR, CER, and WER.
- `lora_adapter/`: adapter weights and processor/tokenizer files.
- No patient name or image is printed in notebook output by design. The CSV still includes transcriptions, so handle it as sensitive even after de-identification.

## Source notes

- Model and training recipe: https://huggingface.co/naazimsnh02/medocr-vision
- Upstream training notebook: https://github.com/Naazimsnh02/medocr-vision/blob/main/medocr-paddle-training-notebook.ipynb
- This notebook follows the upstream Unsloth/TRL conversation format, starts from the published MedOCR-Vision model, uses a small LoRA adapter, prevents group leakage, and adds quantitative held-out evaluation.
