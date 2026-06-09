import sys, json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from datetime import datetime, timedelta

def generate_weekly_excel(leads, output_path):
    wb = Workbook()
    ws = wb.active
    today = datetime.now()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    week_num = today.isocalendar()[1]
    ws.title = f"Week {week_num} — {monday.strftime('%d-%m')} to {sunday.strftime('%d-%m')}"

    YELLOW, ORANGE, PINK, GRAY = "FFD700", "FFA040", "FFB6C1", "D3D3D3"
    GREEN_BG, PINK_BG, WHITE = "E8F5E9", "FCE4EC", "FFFFFF"
    STATUS_COLOR = {
        "interested": GREEN_BG, "waiting": GREEN_BG, "follow_up_needed": GREEN_BG,
        "no_budget": PINK_BG, "closed_lost": PINK_BG,
    }
    thin = Side(style="thin")
    border = Border(top=thin, bottom=thin, left=thin, right=thin)

    def hdr(hex_color):
        return dict(
            fill=PatternFill("solid", fgColor=hex_color),
            font=Font(bold=True, size=11, name="Arial"),
            alignment=Alignment(horizontal="center", vertical="center", wrap_text=True),
            border=border
        )

    def apply(cell, styles):
        for k, v in styles.items(): setattr(cell, k, v)

    col_widths = [6, 20, 28, 30, 30, 45, 35, 20, 20]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    headers = ["STT","Name","Website","Sources","Reach out","Research","Note","Crosscheck","CEO Check"]
    colors  = [YELLOW,YELLOW,YELLOW,YELLOW,ORANGE,YELLOW,PINK,GRAY,GRAY]
    ws.row_dimensions[1].height = 30
    ws.row_dimensions[2].height = 20

    for col, (h, clr) in enumerate(zip(headers, colors), 1):
        apply(ws.cell(row=1, column=col, value=h), hdr(clr))

    apply(ws.cell(row=2, column=5, value="TG"), hdr(ORANGE))
    for col in [1,2,3,4,6,7,8,9]:
        ws.merge_cells(start_row=1, start_column=col, end_row=2, end_column=col)
    ws.freeze_panes = "A3"

    def cell_style(bg):
        return dict(
            fill=PatternFill("solid", fgColor=bg),
            alignment=Alignment(vertical="top", wrap_text=True),
            border=border
        )

    for idx, lead in enumerate(leads, 1):
        row = idx + 2
        ws.row_dimensions[row].height = 90
        bg = STATUS_COLOR.get(lead.get("status",""), WHITE)
        st = cell_style(bg)
        values = [idx, lead.get("name",""), lead.get("website",""), lead.get("sources",""),
                  lead.get("telegram_username",""), lead.get("research",""), lead.get("note",""), "", ""]
        for col, val in enumerate(values, 1):
            cell = ws.cell(row=row, column=col, value=val)
            apply(cell, st)
            cell.font = Font(name="Arial", size=10)

    wb.save(output_path)

if __name__ == "__main__":
    # Nhận: input_json_file output_xlsx_file
    input_file, output_path = sys.argv[1], sys.argv[2]
    with open(input_file, 'r') as f:
        leads = json.load(f)
    generate_weekly_excel(leads, output_path)
    print(f"OK:{output_path}")
