from pathlib import Path
import fitz

output = Path(".agents/outputs/pdf-revision")
output.mkdir(parents=True, exist_ok=True)

for source in [Path("/tmp/nufatur-invoice-revision.pdf"), Path("/tmp/nufatur-receipt-revision.pdf")]:
    document = fitz.open(source)
    stem = source.stem
    print(f"{source.name}: {len(document)} page(s)")
    for index, page in enumerate(document):
        image_path = output / f"{stem}-page-{index + 1}.png"
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        pixmap.save(image_path)
        print(image_path)