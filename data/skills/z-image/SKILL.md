---
name: z-image
description: Ollama z-image-turbo 모델을 사용한 텍스트-이미지 생성 스킬. JSON 형식 프롬프트를 지원하며, 고품질 사실적 이미지와 텍스트 렌더링이 가능합니다. "이미지 생성", "그림 그려줘", "z-image", "이미지 만들어줘", "picture", "image" 등의 요청에 사용합니다. macOS 전용.
---

# Z-Image

Ollama의 z-image-turbo 모델을 활용한 고품질 텍스트-이미지 생성 스킬입니다.

## 주요 특징

- **고품질 사실적 이미지**: 알리바바 Tongyi Lab의 60억 파라미터 모델
- **텍스트 렌더링**: 영어/중국어 텍스트를 이미지에 정확하게 렌더링
- **다양한 출력 형식**: 파일 저장 또는 Base64 반환
- **스타일 프리셋**: 12가지 사전 정의된 스타일 (realistic, anime, cinematic 등)

## 사전 요구사항

```bash
# 1. Ollama 설치 확인
ollama --version

# 2. z-image-turbo 모델 다운로드 (약 13GB)
ollama pull x/z-image-turbo

# 3. Ollama 서버 실행
ollama serve
```

**참고**: z-image-turbo는 현재 **macOS에서만** 동작합니다.

## 워크플로우

### Workflow A: 단순 텍스트 프롬프트로 이미지 생성

```bash
python scripts/z_image_client.py generate \
  --prompt "a cat holding a sign that says hello world" \
  --output cat_hello.png
```

### Workflow B: 스타일 프리셋 적용

prompt_builder.py로 프롬프트를 최적화한 후 생성:

```bash
# 1. 프롬프트 빌드 (cinematic 스타일, high 품질)
python scripts/prompt_builder.py json \
  --prompt "sunset over mountains" \
  --style cinematic \
  --quality high \
  --output sunset.png > prompt.json

# 2. JSON으로 이미지 생성
python scripts/z_image_client.py generate-json --file prompt.json
```

### Workflow C: JSON 파라미터 직접 사용

```bash
python scripts/z_image_client.py generate-json \
  --json '{
    "prompt": "a futuristic city at night, neon lights, cyberpunk",
    "negative_prompt": "blurry, low quality",
    "width": 1024,
    "height": 768,
    "seed": 42,
    "steps": 25,
    "output": "city.png"
  }'
```

### Workflow D: Base64 출력 (프로그래밍 용도)

```bash
# 파일 대신 Base64 데이터로 반환
python scripts/z_image_client.py generate \
  --prompt "beautiful landscape" \
  --format base64
```

### Workflow E: 서버 상태 확인

```bash
python scripts/z_image_client.py check
```

## 스타일 프리셋

prompt_builder.py에서 지원하는 스타일:

| 스타일 | 설명 |
|--------|------|
| `realistic` | 사실적인 사진 스타일 |
| `anime` | 애니메이션/만화 스타일 |
| `digital-art` | 디지털 아트 |
| `oil-painting` | 유화 스타일 |
| `watercolor` | 수채화 스타일 |
| `3d-render` | 3D 렌더링 |
| `sketch` | 연필 스케치 |
| `cinematic` | 영화적 장면 |
| `portrait` | 인물 사진 |
| `landscape` | 풍경 사진 |
| `concept-art` | 컨셉 아트 |
| `minimalist` | 미니멀리즘 |

```bash
# 사용 가능한 스타일 목록 확인
python scripts/prompt_builder.py styles
```

## 품질 레벨

| 레벨 | Steps | 용도 |
|------|-------|------|
| `draft` | 10 | 빠른 미리보기 |
| `standard` | 20 | 일반 용도 (기본값) |
| `high` | 30 | 고품질 출력 |
| `ultra` | 40 | 최고 품질 |

## JSON 파라미터 스키마

```json
{
  "prompt": "이미지 설명 (필수)",
  "negative_prompt": "제외할 요소 (선택)",
  "width": 1024,
  "height": 1024,
  "seed": -1,
  "steps": 20,
  "output": "output.png",
  "format": "file"
}
```

상세 스키마는 `references/json_schema.md` 참조.

## 프롬프트 작성 팁

1. **구체적으로 작성**: "a dog" 보다 "a golden retriever puppy playing in a sunny park"
2. **스타일 지정**: "oil painting style", "photorealistic", "anime" 등 추가
3. **조명/분위기**: "golden hour lighting", "dramatic shadows", "soft ambient light"
4. **텍스트 렌더링**: 이미지에 텍스트를 넣으려면 `holding a sign that says "텍스트"` 형식 사용

상세 가이드는 `references/prompting_guide.md` 참조.

## 제한사항

- **플랫폼**: macOS 전용 (Linux/Windows 미지원)
- **메모리**: fp8 버전 13GB, bf16 버전 33GB 필요
- **API**: OpenAI 호환 API는 실험적이며 변경될 수 있음

## 리소스

### scripts/
- `z_image_client.py`: 이미지 생성 메인 클라이언트
- `prompt_builder.py`: 프롬프트 최적화 유틸리티

### references/
- `prompting_guide.md`: 효과적인 프롬프트 작성 가이드
- `json_schema.md`: JSON 파라미터 상세 스키마
