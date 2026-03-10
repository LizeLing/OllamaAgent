# Z-Image 프롬프트 작성 가이드

z-image-turbo 모델을 위한 효과적인 프롬프트 작성법입니다.

## 기본 원칙

### 1. 구체적으로 작성하기

**나쁜 예:**
```
a dog
```

**좋은 예:**
```
a golden retriever puppy playing with a red ball in a sunny park,
green grass, blue sky, shallow depth of field
```

### 2. 구조적으로 작성하기

프롬프트를 다음 순서로 구성하면 좋습니다:

1. **주제 (Subject)**: 무엇을 그릴지
2. **행동/상태 (Action/State)**: 무엇을 하고 있는지
3. **환경 (Environment)**: 배경/장소
4. **스타일 (Style)**: 예술적 스타일
5. **조명 (Lighting)**: 빛의 특성
6. **품질 (Quality)**: 품질 수식어

**예시:**
```
[주제] a young woman with long black hair
[행동] reading a book while sitting
[환경] in a cozy coffee shop, rainy day outside the window
[스타일] oil painting style, impressionist
[조명] warm ambient lighting, soft shadows
[품질] highly detailed, masterpiece
```

## 스타일 키워드

### 사실적 (Realistic)
- `photorealistic`, `realistic`, `hyperrealistic`
- `photograph`, `photo`, `DSLR`
- `8k`, `4k resolution`, `highly detailed`

### 일러스트레이션
- `digital art`, `illustration`, `concept art`
- `anime`, `manga`, `cartoon`
- `vector art`, `flat design`

### 전통 회화
- `oil painting`, `watercolor`, `acrylic`
- `impressionist`, `renaissance`, `baroque`
- `brush strokes`, `canvas texture`

### 3D 렌더링
- `3d render`, `octane render`, `unreal engine`
- `ray tracing`, `volumetric lighting`
- `CGI`, `cinema 4d`

## 조명 키워드

| 키워드 | 효과 |
|--------|------|
| `golden hour` | 따뜻한 황금빛 석양 |
| `blue hour` | 차가운 파란 새벽/황혼 |
| `dramatic lighting` | 강한 대비의 극적인 조명 |
| `soft ambient light` | 부드러운 주변광 |
| `studio lighting` | 전문 스튜디오 조명 |
| `backlit` | 역광 |
| `rim lighting` | 테두리 조명 |
| `neon lights` | 네온 조명 |

## 텍스트 렌더링

z-image-turbo의 강점 중 하나는 이미지 내 텍스트 렌더링입니다.

### 기본 패턴
```
[주체] holding a sign that says "[텍스트]"
```

**예시:**
```
a cute robot holding a sign that says "Hello World"
```

```
a vintage store front with a neon sign that reads "OPEN 24/7"
```

### 팁
- 짧은 텍스트일수록 정확도가 높음
- 영어와 중국어가 가장 잘 렌더링됨
- 큰 글씨(간판, 포스터)가 작은 글씨보다 정확함

## 부정적 프롬프트 (Negative Prompt)

원하지 않는 요소를 제외하는 데 사용합니다.

### 일반적으로 유용한 부정적 프롬프트
```
low quality, blurry, distorted, deformed, bad anatomy,
watermark, signature, text, ugly, amateur
```

### 인물 사진용
```
distorted face, bad hands, extra fingers, missing limbs,
unnatural pose, crossed eyes
```

### 풍경용
```
people, text, watermark, frame, border
```

## 해상도와 비율

### 권장 해상도
- **정사각형**: 1024x1024 (기본값, 가장 안정적)
- **가로형**: 1024x768, 1280x720
- **세로형**: 768x1024, 720x1280

### 용도별 추천
| 용도 | 비율 | 해상도 |
|------|------|--------|
| 일반 | 1:1 | 1024x1024 |
| 풍경 | 16:9 | 1280x720 |
| 인물 | 3:4 | 768x1024 |
| 배너 | 21:9 | 1260x540 |

## 스타일별 예제

### 사실적 인물 사진
```json
{
  "prompt": "portrait of a young asian woman with short hair, natural makeup, wearing a white shirt, soft smile, studio lighting, shallow depth of field, professional photography, 8k",
  "negative_prompt": "distorted face, bad anatomy, blurry, low quality",
  "width": 768,
  "height": 1024
}
```

### 판타지 풍경
```json
{
  "prompt": "epic fantasy landscape, floating islands in the sky, waterfalls, ancient temples, dramatic clouds, golden hour lighting, concept art style, highly detailed, masterpiece",
  "negative_prompt": "modern buildings, cars, people, watermark",
  "width": 1280,
  "height": 720
}
```

### 애니메이션 캐릭터
```json
{
  "prompt": "anime girl with blue hair and golden eyes, wearing a school uniform, cherry blossom petals, spring day, vibrant colors, manga style, detailed",
  "negative_prompt": "realistic, photograph, 3d render, ugly",
  "width": 1024,
  "height": 1024
}
```

### 제품 샷
```json
{
  "prompt": "sleek modern smartphone floating in the air, minimalist white background, studio lighting, product photography, reflection, professional, high detail",
  "negative_prompt": "hands, people, text, watermark",
  "width": 1024,
  "height": 1024
}
```

### 텍스트가 포함된 이미지
```json
{
  "prompt": "a cute cartoon cat holding a wooden sign that says 'Welcome!', cozy home interior background, warm lighting, digital art style",
  "width": 1024,
  "height": 1024
}
```

## Seed 활용

동일한 seed를 사용하면 비슷한 결과를 재현할 수 있습니다.

```bash
# 마음에 드는 이미지의 seed 기록
# seed: 12345

# 같은 구도로 프롬프트만 변경
python z_image_client.py generate \
  --prompt "같은 구도, 다른 설명" \
  --seed 12345
```

## 품질 최적화 팁

1. **steps 조절**: 20-30이 일반적으로 최적. 40 이상은 수확 체감.
2. **해상도**: 1024x1024가 가장 안정적. 더 큰 해상도는 품질 저하 가능.
3. **반복 생성**: 같은 프롬프트로 여러 번 생성해서 최적 결과 선택.
4. **점진적 개선**: draft → standard → high 순으로 프롬프트 다듬기.
