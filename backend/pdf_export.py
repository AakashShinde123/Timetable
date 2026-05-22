"""PDF generators for timetables using ReportLab."""
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image,
)
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT
import base64

DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

BRAND_BLUE = colors.HexColor('#002FA7')
BRAND_DARK = colors.HexColor('#09090B')
GRID_LIGHT = colors.HexColor('#D4D4D8')
FAINT = colors.HexColor('#FAFAFA')


def _hex_to_color(h):
    try:
        return colors.HexColor(h)
    except Exception:
        return colors.HexColor('#71717A')


def _logo_image(school):
    """Return a ReportLab Image from school.logo base64 dataURL, or None."""
    logo = (school or {}).get('logo')
    if not logo or not isinstance(logo, str):
        return None
    try:
        if ',' in logo:
            b64 = logo.split(',', 1)[1]
        else:
            b64 = logo
        bio = BytesIO(base64.b64decode(b64))
        return Image(bio, width=1.6 * cm, height=1.6 * cm)
    except Exception:
        return None


def _header(elements, school, title, subtitle):
    styles = getSampleStyleSheet()
    h_title = ParagraphStyle('h_title', parent=styles['Heading1'], textColor=BRAND_DARK,
                             fontSize=18, leading=20, spaceAfter=2)
    h_sub = ParagraphStyle('h_sub', parent=styles['Normal'], textColor=colors.HexColor('#71717A'),
                           fontSize=9, leading=12)
    school_name = (school or {}).get('name', 'School')
    location = (school or {}).get('location', '')
    board = (school or {}).get('board', '')
    parts = [Paragraph(f"<b>{school_name}</b>", h_title),
             Paragraph(f"{location} · {board}", h_sub),
             Spacer(1, 4),
             Paragraph(f"<b>{title}</b>", ParagraphStyle('t', parent=styles['Heading2'],
                                                         textColor=BRAND_BLUE, fontSize=14)),
             Paragraph(subtitle, h_sub)]
    logo = _logo_image(school)
    if logo:
        elements.append(Table([[logo, parts]], colWidths=[2 * cm, None],
                              style=[('VALIGN', (0, 0), (-1, -1), 'TOP'),
                                     ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    else:
        for p in parts:
            elements.append(p)
    elements.append(Spacer(1, 10))


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 7)
    canvas.setFillColor(colors.HexColor('#71717A'))
    canvas.drawString(1.5 * cm, 1 * cm, "VIDYA / GRID · TIMETABLE OS")
    canvas.drawRightString(A4[1] - 1.5 * cm, 1 * cm, f"Page {doc.page}")
    canvas.restoreState()


def class_timetable_pdf(school, cls, cells, teachers, subjects, periods):
    """Generate a class timetable PDF and return bytes."""
    teachers_by_id = {t['id']: t for t in teachers}
    subjects_by_id = {s['id']: s for s in subjects}
    cell_map = {f"{c['day']}__{c['period_id']}": c for c in cells}

    bio = BytesIO()
    doc = SimpleDocTemplate(bio, pagesize=landscape(A4),
                            leftMargin=1.2 * cm, rightMargin=1.2 * cm,
                            topMargin=1.2 * cm, bottomMargin=1.2 * cm)
    elements = []
    _header(elements, school, f"Timetable · {cls.get('name')}",
            f"Class Teacher: {teachers_by_id.get(cls.get('class_teacher_id'), {}).get('name', '—')}"
            f" · Strength: {cls.get('strength', '—')}")

    # Build the grid
    header_row = ['Period'] + DAYS
    table_data = [header_row]
    for p in periods:
        row = [f"{p['name']}\n{p['start_time']}-{p['end_time']}"]
        for d in DAYS:
            c = cell_map.get(f"{d}__{p['id']}")
            if p.get('is_break'):
                row.append('— BREAK —'); continue
            if not c:
                row.append(''); continue
            sub = subjects_by_id.get(c.get('subject_id'))
            t = teachers_by_id.get(c.get('teacher_id'))
            lines = []
            if sub:
                lines.append(f"<b>{sub.get('code', '')}</b>")
            if t:
                lines.append(t.get('abbreviation', ''))
            row.append(Paragraph('<br/>'.join(lines) if lines else '',
                                 ParagraphStyle('cell', fontSize=8, leading=10, alignment=TA_CENTER)))
        table_data.append(row)

    col_widths = [2.4 * cm] + [3.6 * cm] * len(DAYS)
    tbl = Table(table_data, colWidths=col_widths, rowHeights=[0.8 * cm] + [1.4 * cm] * len(periods))
    style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_DARK),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.4, GRID_LIGHT),
        ('BACKGROUND', (0, 1), (0, -1), FAINT),
        ('FONTSIZE', (0, 1), (0, -1), 7),
    ])
    # Color subject cells
    for ri, p in enumerate(periods, start=1):
        for ci, d in enumerate(DAYS, start=1):
            c = cell_map.get(f"{d}__{p['id']}")
            if not c or not c.get('subject_id'):
                continue
            sub = subjects_by_id.get(c.get('subject_id'))
            if sub:
                style.add('BACKGROUND', (ci, ri), (ci, ri), _hex_to_color(sub.get('color', '#0055FF')).clone(alpha=0.15) if hasattr(_hex_to_color(sub.get('color', '#0055FF')), 'clone') else colors.HexColor('#F0F4FF'))
    tbl.setStyle(style)
    elements.append(tbl)

    doc.build(elements, onFirstPage=_footer, onLaterPages=_footer)
    return bio.getvalue()


def teacher_schedule_pdf(school, teacher, cells, subjects, classes, periods):
    subjects_by_id = {s['id']: s for s in subjects}
    classes_by_id = {c['id']: c for c in classes}
    cell_map = {f"{c['day']}__{c['period_id']}": c for c in cells}

    bio = BytesIO()
    doc = SimpleDocTemplate(bio, pagesize=landscape(A4),
                            leftMargin=1.2 * cm, rightMargin=1.2 * cm,
                            topMargin=1.2 * cm, bottomMargin=1.2 * cm)
    elements = []
    _header(elements, school, f"Teacher Schedule · {teacher.get('name')} ({teacher.get('abbreviation')})",
            f"{len(cells)} periods / week · "
            f"{'Class Teacher' if teacher.get('is_class_teacher') else 'Subject Teacher'}")

    header_row = ['Period'] + DAYS
    table_data = [header_row]
    for p in periods:
        row = [f"{p['name']}\n{p['start_time']}-{p['end_time']}"]
        for d in DAYS:
            c = cell_map.get(f"{d}__{p['id']}")
            if p.get('is_break'):
                row.append('— BREAK —'); continue
            if not c:
                row.append(''); continue
            sub = subjects_by_id.get(c.get('subject_id'))
            cls = classes_by_id.get(c.get('class_id'))
            lines = []
            if sub:
                lines.append(f"<b>{sub.get('code', '')}</b>")
            if cls:
                lines.append(cls.get('name', ''))
            row.append(Paragraph('<br/>'.join(lines) if lines else '',
                                 ParagraphStyle('cell', fontSize=8, leading=10, alignment=TA_CENTER)))
        table_data.append(row)

    col_widths = [2.4 * cm] + [3.6 * cm] * len(DAYS)
    tbl = Table(table_data, colWidths=col_widths, rowHeights=[0.8 * cm] + [1.4 * cm] * len(periods))
    style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_DARK),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.4, GRID_LIGHT),
        ('BACKGROUND', (0, 1), (0, -1), FAINT),
        ('FONTSIZE', (0, 1), (0, -1), 7),
    ])
    tbl.setStyle(style)
    elements.append(tbl)

    # Workload footer
    elements.append(Spacer(1, 12))
    styles = getSampleStyleSheet()
    workload_lines = {}
    for c in cells:
        d = c.get('day', 'Mon')
        workload_lines[d] = workload_lines.get(d, 0) + 1
    elements.append(Paragraph(
        "<b>Weekly Workload Summary</b>",
        ParagraphStyle('wl', parent=styles['Heading4'], textColor=BRAND_BLUE, fontSize=10, spaceAfter=4)
    ))
    wl_data = [["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Total"]]
    wl_data.append([str(workload_lines.get(d, 0)) for d in DAYS] + [str(len(cells))])
    wl_tbl = Table(wl_data, colWidths=[2 * cm] * 7)
    wl_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), FAINT),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.3, GRID_LIGHT),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    elements.append(wl_tbl)
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(
        f"Max/day: {teacher.get('max_periods_per_day', 6)} · Max/week: {teacher.get('max_periods_per_week', 30)}",
        ParagraphStyle('foot', parent=styles['Normal'], fontSize=8,
                       textColor=colors.HexColor('#71717A'))
    ))

    doc.build(elements, onFirstPage=_footer, onLaterPages=_footer)
    return bio.getvalue()


def bell_schedule_pdf(school, shifts, periods_by_shift):
    """Weekly bell schedule cover page — single page listing all shifts and their periods."""
    bio = BytesIO()
    doc = SimpleDocTemplate(bio, pagesize=A4,
                            leftMargin=1.5 * cm, rightMargin=1.5 * cm,
                            topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    elements = []
    _header(elements, school, "Weekly Bell Schedule",
            f"All shifts · Working days as configured")
    styles = getSampleStyleSheet()

    for sh in shifts:
        elements.append(Paragraph(
            f"<b>{sh.get('name', 'Shift')}</b> · {sh.get('start_time')} – {sh.get('end_time')}",
            ParagraphStyle('sh', parent=styles['Heading3'], textColor=BRAND_BLUE,
                           fontSize=12, spaceBefore=8, spaceAfter=4)
        ))
        elements.append(Paragraph(
            f"Working days: {', '.join(sh.get('working_days', []))}",
            ParagraphStyle('wd', parent=styles['Normal'], fontSize=8,
                           textColor=colors.HexColor('#71717A'), spaceAfter=4)
        ))
        ps = periods_by_shift.get(sh['id'], [])
        if not ps:
            elements.append(Paragraph("(no periods configured)",
                                       ParagraphStyle('na', fontSize=8,
                                                      textColor=colors.HexColor('#71717A'))))
            continue
        rows = [["#", "Name", "Start", "End", "Type"]]
        for i, p in enumerate(ps, 1):
            rows.append([str(i), p.get('name', ''), p.get('start_time', ''),
                         p.get('end_time', ''), 'BREAK' if p.get('is_break') else 'Class'])
        tbl = Table(rows, colWidths=[1 * cm, 5 * cm, 2.5 * cm, 2.5 * cm, 2 * cm])
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), BRAND_DARK),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.3, GRID_LIGHT),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
        ]))
        elements.append(tbl)

    doc.build(elements, onFirstPage=_footer, onLaterPages=_footer)
    return bio.getvalue()
