# 설계의뢰서 양식 생성 — 항목 정의는 request.js(FIELDS) 하나에서 가져온다.
# 실행: python3 tools/make_request_template.py  → templates/설계의뢰서_PGD-REQ-2.xlsx
import json, subprocess, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.comments import Comment

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = json.loads(subprocess.check_output(['node', '-e',
    "const R=require('./request.js');console.log(JSON.stringify({F:R.FIELDS,K:R.KINDS,FORMAT:R.FORMAT,SHEET:R.SHEET}))"], cwd=ROOT))
F, KINDS, FORMAT, SHEET = R['F'], R['K'], R['FORMAT'], R['SHEET']

# 예시: 표준 DB (designs/standard-d100-l100-i25.json) 의뢰 조건 그대로
std = json.load(open(os.path.join(ROOT, 'designs/standard-d100-l100-i25.json')))
q, meta = std['request'], std['D']['meta']
EX = {'M1': meta['client'], 'M2': meta['requester'], 'M3': meta['date'], 'M4': meta['application'],
      'I3': q['rpm'], 'I5': q['Trated'], 'I6': '정격', 'I7': q['ratio'], 'I8': q['Dmax'], 'I9': q['Lmax'],
      'I11': q['lifeH'], 'I12a': q['ext']['Fr'], 'I12b': q['ext']['Fa'], 'I12c': q['ext']['M'],
      'I13': q['Tpeak'], 'I14': q['Temerg']}

AR = 'Arial'
f_title = Font(name=AR, size=14, bold=True); f_b = Font(name=AR, bold=True); f_n = Font(name=AR)
f_in = Font(name=AR, color='0000FF'); f_g = Font(name=AR, color='808080', size=9)
fill_in = PatternFill('solid', fgColor='FFFF00'); fill_h = PatternFill('solid', fgColor='D9E1F2'); fill_sec = PatternFill('solid', fgColor='F2F2F2')
thin = Side(style='thin', color='BFBFBF'); box = Border(left=thin, right=thin, top=thin, bottom=thin)
NEED = {'Y': '필수', 'C': '조건부', '': '선택'}
SECT = {'M1': '의뢰 정보', 'I1': '모터', 'I5': '요구 성능', 'I8': '외형 (절대 고정)', 'I11': '수명 · 외력', 'I13': '정격 직접 지정 (모터 대신 쓸 때)'}

def sheet(ws, values):
    ws['A1'] = '유성감속기 설계의뢰서'; ws['A1'].font = f_title
    ws['A2'] = 'FORMAT'; ws['B2'] = '양식 버전 (수정 금지)'; ws['C2'] = FORMAT
    for c in 'ABC': ws[c + '2'].font = f_g
    ws['A3'] = '노란 칸(C열)만 입력합니다. 빈칸은 오른쪽 "빈칸일 때" 값으로 계산하고 결과에 "가정"으로 표시합니다. 빈칸과 0은 다릅니다.'
    ws['A3'].font = f_g
    hdr = ['ID', '항목', '값', '단위', '구분', '빈칸일 때']
    r = 5
    for j, h in enumerate(hdr):
        c = ws.cell(r, j + 1, h); c.font = f_b; c.fill = fill_h; c.border = box
    dv_kind = DataValidation(type='list', formula1='"' + ','.join(KINDS) + '"', allow_blank=True,
                             error='정격 / 반복 피크 / 순간 최대 / 모름 중 하나', errorTitle='토크 종류', showErrorMessage=True)
    dv_num = DataValidation(type='decimal', operator='greaterThanOrEqual', formula1='0', allow_blank=True,
                            error='0 이상의 숫자', errorTitle='숫자 입력', showErrorMessage=True)
    ws.add_data_validation(dv_kind); ws.add_data_validation(dv_num)
    for f in F:
        if f['id'] in SECT:
            r += 1; c = ws.cell(r, 1, SECT[f['id']]); c.font = f_b
            for j in range(1, 7): ws.cell(r, j).fill = fill_sec
        r += 1
        row = [f['id'], f['label'], values.get(f['id']), f['unit'], NEED[f['need']], f['blank']]
        for j, v in enumerate(row):
            c = ws.cell(r, j + 1, v); c.font = f_n; c.border = box
        v = ws.cell(r, 3); v.fill = fill_in; v.font = f_in
        if f['type'] == 'kind':
            dv_kind.add(v); v.comment = Comment('정격: 수명 동안 연속 운전 토크\n반복 피크: 기동·정지 때 반복 토크\n순간 최대: 충돌·비상정지 토크\n모름: 모터 토크 전부를 받는다고 계산', 'PGD')
        elif f['type'] == 'num':
            dv_num.add(v)
        if f['type'] == 'num': v.number_format = 'General'
    for col, w in zip('ABCDEF', [7, 44, 16, 7, 8, 42]): ws.column_dimensions[col].width = w
    ws.freeze_panes = 'A6'

wb = Workbook()
ws = wb.active; ws.title = SHEET; sheet(ws, {})
ex = wb.create_sheet('예시 (표준 DB)'); sheet(ex, EX)
ex['A3'] = '표준 DB (Ø100 × 100, 감속비 25, 정격 25 N·m) 의뢰 조건입니다. 모터 대신 반복 피크·순간 최대를 직접 지정한 예입니다.'
g = wb.create_sheet('안내')
rows = [('유성감속기 설계의뢰서 안내', f_title), ('', None),
        ('1. "의뢰서" 시트의 노란 칸만 채워 사이트에서 불러옵니다. 행을 끼워 넣어도 A열 ID로 읽습니다.', f_n),
        ('2. 필수: I3 회전수, I5 필요 출력 토크, I6 토크 종류, I7 감속비, I8 외경, I9 길이.', f_n),
        ('3. 모터 토크(I1 · I2)는 반복 피크(I13)와 순간 최대(I14)를 직접 쓰면 생략할 수 있습니다.', f_n),
        ('4. 정격 체계 (상용 유성 감속기 카탈로그 방식):', f_b),
        ('   정격 = 정격 입력 회전수에서 정격 수명(기본 20,000 h) 동안 연속 운전 토크', f_n),
        ('   반복 피크 = 기동·정지 때 반복 허용 토크 / 순간 최대 = 충돌·비상정지 토크 (수명 중 약 1,000회)', f_n),
        ('5. 판정: 요구 토크·수명에서 ISO 6336 안전율 SH ≥ 1.0, SF ≥ 1.4 이상이면 합격.', f_n),
        ('6. 외경·길이는 절대 고정입니다. 넘는 설계안은 제안하지 않습니다.', f_n),
        ('근거: docs/DESIGN-ALGORITHM.md §1 · §2 · §3', f_g)]
for i, (t, fo) in enumerate(rows, 1):
    c = g.cell(i, 1, t)
    if fo: c.font = fo
g.column_dimensions['A'].width = 100
out = os.path.join(ROOT, 'templates', f'설계의뢰서_{FORMAT}.xlsx'); wb.save(out); print(out)
