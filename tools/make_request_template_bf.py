# 설계의뢰서 양식 생성 — 항목 정의는 request.js(FIELDS) 하나에서 가져온다.
# 베어링 기준 의뢰서 (AD-2). 실행: python3 tools/make_request_template_bf.py → templates/설계의뢰서_PGD-REQ-3.xlsx
import json, subprocess, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.comments import Comment

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = json.loads(subprocess.check_output(['node', '-e',
    "const R=require('./request.js');console.log(JSON.stringify({F:R.FIELDS_BF,K:R.KINDS,FORMAT:R.FORMAT_BF,SHEET:R.SHEET}))"], cwd=ROOT))
F, KINDS, FORMAT, SHEET = R['F'], R['K'], R['FORMAT'], R['SHEET']

EX = {'M1': '예시', 'I7': 25, 'B1': 'THK RU42', 'G1': 3, 'O1': 'N', 'O2': 'N', 'I3': 3000, 'I11': 20000}

AR = 'Arial'
f_title = Font(name=AR, size=14, bold=True); f_b = Font(name=AR, bold=True); f_n = Font(name=AR)
f_in = Font(name=AR, color='0000FF'); f_g = Font(name=AR, color='808080', size=9)
fill_in = PatternFill('solid', fgColor='FFFF00'); fill_h = PatternFill('solid', fgColor='D9E1F2'); fill_sec = PatternFill('solid', fgColor='F2F2F2')
thin = Side(style='thin', color='BFBFBF'); box = Border(left=thin, right=thin, top=thin, bottom=thin)
NEED = {'Y': '필수', 'C': '조건부', '': '선택'}
SECT = {'M1': '의뢰 정보', 'I7': '감속비 · 출력 베어링 · 구조', 'I3': '운전 · 수명 · 외력', 'K1': '토크 산출 계수 (보통 빈칸)'}

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
    dv_yn = DataValidation(type='list', formula1='"Y,N"', allow_blank=True, error='Y 또는 N', errorTitle='선택', showErrorMessage=True)
    ws.add_data_validation(dv_kind); ws.add_data_validation(dv_num); ws.add_data_validation(dv_yn)
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
        elif f['type'] == 'yn':
            dv_yn.add(v)
        elif f['type'] == 'bearing':
            v.comment = Comment('사이트 카탈로그의 형번 (예: THK RU42, IKO CRBTF405AT). 사이트 화면에서는 목록에서 고릅니다.', 'PGD')
        elif f['type'] == 'num':
            dv_num.add(v)
        if f['type'] == 'num': v.number_format = 'General'
    for col, w in zip('ABCDEF', [7, 44, 16, 7, 8, 42]): ws.column_dimensions[col].width = w
    ws.freeze_panes = 'A6'

wb = Workbook()
ws = wb.active; ws.title = SHEET; sheet(ws, {})
ex = wb.create_sheet('예시'); sheet(ex, EX)
ex['A3'] = '감속비 25 · THK RU42 · 링 분리 · 전위 0 예시입니다.'
g = wb.create_sheet('안내')
rows = [('유성감속기 설계의뢰서 (베어링 기준) 안내', f_title), ('', None),
        ('1. "의뢰서" 시트의 노란 칸만 채워 사이트에서 불러옵니다. 행을 끼워 넣어도 A열 ID로 읽습니다.', f_n),
        ('2. 필수: I7 감속비, B1 출력 베어링 형번, I3 정격 입력 회전수.', f_n),
        ('3. 설계 순서: 출력 베어링 → 목표 출력 토크 (C0 기준) → 2단 링 피치원 ≈ 롤러 피치원 → 2단 → 1단 → 1·2단 토크 밸런스 → 5안 비교.', f_n),
        ('4. 목표 출력 토크 = κ × C0 · dp / (2000 · s0). 요구 토크 · 외경 · 길이는 입력하지 않습니다.', f_n),
        ('5. 외경 = 2단 링기어 림 포함 외경, 길이 = 1단 치폭 + 캐리어 간격(G1) + 2단 치폭 (자동 산출).', f_n),
        ('6. O1 전위 탐색, O2 링 공유를 Y로 하면 그 조건으로만 탐색합니다. 링 분리이면 1단 링 외경은 2단 링 외경 안에서 자유입니다.', f_n),
        ('7. 판정: ISO 6336:2019 (KISSsoft 방식), SH ≥ 1.0 · SF ≥ 1.4.', f_n),
        ('근거: docs/DESIGN-ALGORITHM.md §10 (AD-2)', f_g)]
for i, (t, fo) in enumerate(rows, 1):
    c = g.cell(i, 1, t)
    if fo: c.font = fo
g.column_dimensions['A'].width = 100
out = os.path.join(ROOT, 'templates', f'설계의뢰서_{FORMAT}.xlsx'); wb.save(out); print(out)
