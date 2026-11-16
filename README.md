# PLANETARY-GEAR

유성감속기 설계실 — 실물·실측 데이터 없이 규격식·물리 모델·명시된 가정으로 2단 중공 유성감속기를 설계하고 검증하는 웹사이트.

- 마스터플랜: [docs/MASTERPLAN.md](docs/MASTERPLAN.md) — 구조 결정 알고리즘 (최소 입력 → 전체 치수 → 검증 루프)
- 사이트: `index.html`을 열면 동작 (외부 로드는 cdnjs의 three.js 하나)

## 작업 규칙

- 사이트 수정은 이 저장소에서만, 브랜치 → PR로 올린다
- 커밋 메시지 앞에 작성 주체를 붙인다: `[Claude]`, `[GPT]`
- `engine.js`(계산 엔진)를 바꾸지 않는 변경은 `node compat_test.js` 결과가 cap 10.877603 / static 41.211661 그대로여야 한다
