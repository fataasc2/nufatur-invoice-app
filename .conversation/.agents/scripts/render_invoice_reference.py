import fitz
from pathlib import Path

pdf_path = Path("attached_assets/4100926_DBW_INV_09_2026_NUFA_TOUR-1_1789997421046.pdf")
output_dir = Path(".agents/outputs/invoice_reference")
output_dir.mkdir(parents=True, exist_ok=True)

doc = fitz.open(pdf_path)
print(f"pages={doc.page_count}")
for page_number, page in enumerate(doc, start=1):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    output_path = output_dir / f"page-{page_number}.png"
    pixmap.save(output_path)
    print(f"rendered={output_path} size={pixmap.width}x{pixmap.height}")