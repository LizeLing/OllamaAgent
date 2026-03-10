# Z-Image JSON 파라미터 스키마

z_image_client.py의 generate-json 명령에서 사용하는 JSON 파라미터 스키마입니다.

## 전체 스키마

```json
{
  "prompt": "string (필수)",
  "negative_prompt": "string (선택)",
  "width": "integer (선택, 기본값: 1024)",
  "height": "integer (선택, 기본값: 1024)",
  "seed": "integer (선택, 기본값: -1)",
  "steps": "integer (선택, 기본값: 20)",
  "output": "string (선택)",
  "format": "string (선택, 기본값: 'file')"
}
```

## 파라미터 상세 설명

### prompt (필수)

이미지를 설명하는 텍스트 프롬프트입니다.

| 속성 | 값 |
|------|-----|
| 타입 | string |
| 필수 | 예 |
| 최대 길이 | 제한 없음 (권장: 500자 이내) |

**예시:**
```json
{
  "prompt": "a beautiful sunset over the ocean, golden light reflecting on the water, peaceful atmosphere"
}
```

### negative_prompt (선택)

이미지에서 제외하고 싶은 요소를 지정합니다.

| 속성 | 값 |
|------|-----|
| 타입 | string |
| 필수 | 아니오 |
| 기본값 | null |

**예시:**
```json
{
  "prompt": "portrait of a woman",
  "negative_prompt": "blurry, low quality, distorted face, bad anatomy"
}
```

### width (선택)

생성할 이미지의 너비(픽셀)입니다.

| 속성 | 값 |
|------|-----|
| 타입 | integer |
| 필수 | 아니오 |
| 기본값 | 1024 |
| 최소값 | 256 |
| 최대값 | 2048 |
| 권장값 | 512, 768, 1024, 1280 |

### height (선택)

생성할 이미지의 높이(픽셀)입니다.

| 속성 | 값 |
|------|-----|
| 타입 | integer |
| 필수 | 아니오 |
| 기본값 | 1024 |
| 최소값 | 256 |
| 최대값 | 2048 |
| 권장값 | 512, 768, 1024, 1280 |

**일반적인 해상도 조합:**
```json
// 정사각형 (1:1)
{ "width": 1024, "height": 1024 }

// 가로형 (16:9)
{ "width": 1280, "height": 720 }

// 세로형 (9:16)
{ "width": 720, "height": 1280 }

// 가로형 (4:3)
{ "width": 1024, "height": 768 }
```

### seed (선택)

랜덤 시드 값입니다. 동일한 시드와 프롬프트를 사용하면 유사한 결과를 재현할 수 있습니다.

| 속성 | 값 |
|------|-----|
| 타입 | integer |
| 필수 | 아니오 |
| 기본값 | -1 (랜덤) |
| 범위 | -1 또는 0 ~ 2^32-1 |

**예시:**
```json
// 랜덤 시드 사용
{ "seed": -1 }

// 특정 시드로 결과 재현
{ "seed": 12345 }
```

### steps (선택)

이미지 생성 단계 수입니다. 높을수록 품질이 좋아지지만 생성 시간이 길어집니다.

| 속성 | 값 |
|------|-----|
| 타입 | integer |
| 필수 | 아니오 |
| 기본값 | 20 |
| 범위 | 1 ~ 100 |
| 권장값 | 10, 20, 30, 40 |

**품질별 권장 steps:**
| 용도 | steps | 설명 |
|------|-------|------|
| 초안/미리보기 | 10 | 빠른 결과, 낮은 품질 |
| 일반 | 20 | 품질과 속도의 균형 |
| 고품질 | 30 | 디테일 향상 |
| 최고 품질 | 40+ | 최대 디테일 (수확 체감) |

### output (선택)

출력 파일 경로입니다. format이 "file"일 때만 사용됩니다.

| 속성 | 값 |
|------|-----|
| 타입 | string |
| 필수 | 아니오 (format="file"일 때 권장) |
| 기본값 | z_image_YYYYMMDD_HHMMSS.png |

**예시:**
```json
// 상대 경로
{ "output": "output/my_image.png" }

// 절대 경로
{ "output": "/Users/user/Pictures/generated.png" }
```

### format (선택)

출력 형식을 지정합니다.

| 속성 | 값 |
|------|-----|
| 타입 | string |
| 필수 | 아니오 |
| 기본값 | "file" |
| 허용값 | "file", "base64" |

**"file" 모드:**
- 이미지를 파일로 저장
- output 경로에 PNG 파일 생성
- 반환: 저장된 파일의 절대 경로

**"base64" 모드:**
- 이미지를 Base64 문자열로 반환
- 파일을 저장하지 않음
- 반환: Base64 인코딩된 PNG 데이터

## 전체 예제

### 기본 이미지 생성

```json
{
  "prompt": "a serene Japanese garden with a koi pond, cherry blossoms, traditional wooden bridge, morning mist, photorealistic"
}
```

### 모든 파라미터 사용

```json
{
  "prompt": "portrait of a wise old wizard with a long white beard, holding a glowing staff, magical particles floating around, fantasy art style, dramatic lighting",
  "negative_prompt": "modern clothes, technology, blurry, low quality, bad anatomy",
  "width": 768,
  "height": 1024,
  "seed": 42,
  "steps": 30,
  "output": "wizard_portrait.png",
  "format": "file"
}
```

### Base64 출력

```json
{
  "prompt": "minimalist logo design, abstract geometric shapes, blue and white colors, clean lines",
  "width": 512,
  "height": 512,
  "steps": 25,
  "format": "base64"
}
```

### 반복 생성용 (시드 고정)

```json
{
  "prompt": "cyberpunk cityscape at night, neon signs, flying cars, rain, blade runner style",
  "seed": 98765,
  "width": 1280,
  "height": 720,
  "steps": 25,
  "output": "cyberpunk_v1.png"
}
```

## 응답 형식

### 성공 시 (format: "file")

```json
{
  "success": true,
  "format": "file",
  "path": "/absolute/path/to/image.png",
  "seed": 12345,
  "prompt": "original prompt text"
}
```

### 성공 시 (format: "base64")

```json
{
  "success": true,
  "format": "base64",
  "data": "iVBORw0KGgoAAAANSUhEUgAA...(base64 data)...",
  "seed": 12345,
  "prompt": "original prompt text"
}
```

### 오류 시

```json
{
  "error": "Error description message"
}
```

## 유효성 검사 규칙

1. **prompt**: 비어있으면 안 됨
2. **width/height**: 256 ~ 2048 사이
3. **steps**: 1 ~ 100 사이
4. **format**: "file" 또는 "base64"만 허용
5. **seed**: -1 이상의 정수
