---
name: 자가 개선 (AutoResearch)
description: AI 에이전트가 자율적으로 벤치마크를 실행하고 설정을 최적화하는 자가 개선 시스템
icon: 🔬
triggerCommand: autoresearch
enabledTools: http_request,filesystem_read,filesystem_write
---

# AutoResearch: 자가 개선 실험 루프

이 스킬은 Karpathy의 autoresearch에서 영감을 받은 자가 개선 시스템입니다.
에이전트가 자율적으로 설정을 변경하고, 벤치마크를 실행하며, 개선된 설정만 유지합니다.

## 실험 흐름

1. **베이스라인 측정**: 현재 설정으로 벤치마크 실행 → 기준 점수 확보
2. **전략 적용**: 파라미터 변형 (temperature, top_p, 시스템 프롬프트 등)
3. **재측정**: 변형된 설정으로 동일 벤치마크 실행
4. **판정**: 점수가 개선되면 keep (설정 저장), 아니면 discard (원복)
5. **반복**: 다음 전략으로 이동

## 사용 방법

### API로 실행
```
POST /api/autoresearch
Body: {
  "maxExperiments": 10,
  "improvementThreshold": 0.5
}
```

### 상태 확인
```
GET /api/autoresearch
```

### 결과 조회
```
GET /api/autoresearch/results
```

### 중단
```
DELETE /api/autoresearch
```

## 벤치마크 카테고리

| 카테고리 | 측정 항목 | 평가 방식 |
|---------|----------|----------|
| tool_selection | 올바른 도구 선택 | Jaccard 유사도 |
| response_quality | 응답 품질 | LLM-as-Judge + 키워드 |
| reasoning | 추론 능력 | 정답 키워드 매칭 |
| instruction_following | 지시 따르기 | 형식 키워드 + LLM |

## 최적화 전략

1. **Temperature 스윕**: 0.3, 0.5, 0.7, 0.9, 1.0
2. **Top-p 스윕**: 0.7, 0.8, 0.9, 0.95
3. **Thinking 모드**: off, on (도구 선택 포함)
4. **Max Iterations**: 5, 8, 15
5. **시스템 프롬프트**: 간결, 상세, 도구 가이드 추가

## 설계 원칙 (autoresearch에서 차용)

- **고정 벤치마크**: 동일 테스트 케이스로 공정 비교
- **단일 메트릭**: overallScore (0-100)로 판정
- **Keep/Discard**: 개선된 것만 유지, 나머지는 되돌림
- **자율 실행**: 한번 시작하면 모든 전략을 자동 탐색
- **결과 로깅**: 모든 실험을 results.json에 기록
