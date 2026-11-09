# 공통 컴포넌트 수정

네 페이지는 같은 공통 HTML 원본을 사용합니다. 브라우저에는 완성된 정적 HTML을 제공하므로 별도 설치 없이 미리보기할 수 있습니다.

1. 이 폴더의 HTML을 수정합니다.
2. 프로젝트 폴더에서 `node scripts/sync-components.mjs`를 실행합니다.
3. 네 페이지를 새로고침합니다. `node scripts/sync-components.mjs --check`로 동기화 여부를 확인합니다.

| 수정 대상 | 원본 |
| --- | --- |
| 문서 머리·공통 파일 연결 | `documentHead.html` |
| 내비게이션·푸터 | `siteNav.html`, `siteFooter.html` |
| 메인·제품 히어로 골격 | `hero.html` |
| 메인·앱의 페르소나와 스마트폰 | `persona.html`, `smartphone.html` |
| 제품·구매의 제품 설명 | `carousel.html`, `bluetooth.html`, `slogan.html`, `battery.html`, `exAi.html`, `info.html` |
| 구매 제품 구성 | `productSet.html` |

공통 HTML의 `{{값}}`은 `scripts/sync-components.mjs`에서 페이지별로 지정합니다. 페이지 제목, 히어로 문구·이미지·버튼 링크, 현재 메뉴가 여기에 해당합니다.

공통 스타일은 `css/components.css`와 `css/sections.css`, 공통 동작은 `js/components.js`에서 수정합니다. 페이지별 차이는 각 페이지 이름의 CSS에 둡니다. 메인 연출은 `js/mainPage.js`, 구매 옵션은 `js/purchase.js`에서 관리합니다.

HTML 주석은 `공통: 이름` / `/공통: 이름`, `페이지: 이름` / `/페이지: 이름`으로 통일합니다. 공통 주석 안의 HTML은 동기화 시 원본으로 갱신됩니다. 페이지 주석 안의 HTML은 해당 페이지에서 직접 수정합니다.

앱 다운로드 주소와 실제 구매·장바구니 연결은 아직 없습니다. App Store 버튼은 비활성 상태이며 구매 버튼은 선택한 구성을 확인하는 창을 표시합니다. 가격·제품 사양은 기존 자료를 유지합니다.
