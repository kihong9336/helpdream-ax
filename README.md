# HelpDream AX Studio — Prototype v0.1

실행형 AX 스튜디오 포지셔닝을 검증하기 위한 첫 랜딩페이지 프로토타입입니다.

## 핵심 포지셔닝

- 브랜드: HelpDream
- 카테고리: 실행형 AX 스튜디오
- 핵심 문장: 보고서가 아니라, 작동하는 AI를 만듭니다.
- 초기 타깃: AI 전담 개발팀이 없는 중소기업·스타트업·전문서비스 조직
- 진입 전략: 전사 혁신이 아니라 반복 업무 하나의 진단 → 파일럿 → 확장

## 서비스 구조

1. AX Opportunity Scan
2. AX Pilot Sprint
3. AX Operating System

## 로컬 실행

```bash
cd /Users/user/projects/helpdream-ax
python3 -m http.server 4173
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다.

## 공개 전 필수 결정

- 실제 상담 수신 채널(이메일, 캘린더, 폼 서비스)
- 사업자/대표자 정보와 개인정보처리방침
- 데모별 공개 가능한 화면·설명
- 서비스 가격 공개 여부
- 정적 호스팅 선택(Vercel, Cloudflare Pages 등)
- 기존 네이버 스마트스토어 리디렉션/DNS 해제 및 HTTPS 연결

## 정직성 원칙

현재 AX Lab 항목은 고객사 납품 사례가 아니라 자체 데모·제품 실험으로 명시합니다. 검증되지 않은 수치, 고객 로고, 후기, 성과는 사용하지 않습니다.
