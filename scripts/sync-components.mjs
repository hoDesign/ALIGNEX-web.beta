import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 공통: 정적 HTML 동기화. --check는 파일을 변경하지 않습니다.
const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
const pages = {
    mainPage: {
        pageTitle: 'ALIGNEX — 나를 위한 운동',
        description: '나에게 맞는 운동을 제안하는 ALIGNEX. 일상복처럼 간편한 기기와 맞춤 운동 경험을 만나보세요.',
        heroImage: './img/JPG/인물클로즈업.jpg',
        heroTitle: 'ALIGNEX',
        heroCopy: '헬스케어의 새로운 패러다임',
        heroSecondaryHref: './application.html',
        heroSecondaryLabel: '다운로드'
    },
    experience: {
        pageTitle: 'EX Complete 경험 | ALIGNEX',
        description: 'EX Suit, EX Device와 ALIGNEX 앱으로 이어지는 맞춤 운동 경험과 제품 정보를 확인하세요.',
        heroImage: './assets/figma/experience-hero.png',
        heroTitle: 'EX Complete',
        heroCopy: '웨어러블 제품 콘셉트에서<br>루틴·운동·휴식을 연결하는 앱 경험까지.',
        heroSecondaryHref: '#carousel',
        heroSecondaryLabel: '더 알아보기'
    },
    purchase: {
        pageTitle: 'EX Complete 구입하기 | ALIGNEX',
        description: 'ALIGNEX EX Complete의 성별, 색상, 사이즈와 제품 구성을 선택하세요.'
    },
    application: {
        pageTitle: 'ALIGNEX 앱 | 나를 위한 운동',
        description: '스마트폰과 스마트워치로 이어지는 ALIGNEX의 개인화된 운동 경험을 만나보세요.'
    }
};
const sharedNames = ['documentHead', 'siteNav', 'siteFooter', 'hero', 'persona', 'smartphone', 'carousel', 'bluetooth', 'slogan', 'battery', 'exAi', 'info', 'productSet'];
const templates = Object.fromEntries(await Promise.all(sharedNames.map(async name => [name, (await readFile(path.join(root, 'components', `${name}.html`), 'utf8')).trim()])));
let stale = false;
for (const [pageName, page] of Object.entries(pages)) {
    const data = {
        ...page, pageName,
        navModifier: ['purchase', 'application'].includes(pageName) ? ' siteNav--solid' : '',
        brandCurrent: pageName === 'mainPage' ? ' aria-current="page"' : '',
        experienceCurrent: pageName === 'experience' ? ' aria-current="page"' : '',
        purchaseCurrent: pageName === 'purchase' ? ' aria-current="page"' : '',
        applicationCurrent: pageName === 'application' ? ' aria-current="page"' : '',
        pageScript: pageName === 'mainPage'
            ? '    <script src="./js/membrane-shader.js" defer></script>\n    <script src="./js/membrane-background.js" defer></script>\n    <script src="./js/mainPage.js" defer></script>'
            : pageName === 'purchase' ? '    <script src="./js/purchase.js" defer></script>' : ''
    };
    const file = path.join(root, `${pageName}.html`);
    const before = await readFile(file, 'utf8');
    const after = before.replace(/^([ \t]*)<!-- 공통: (\w+) -->[\s\S]*?<!-- \/공통: \2 -->/gm, (_, indent, name) => {
        if (!templates[name]) throw new Error(`알 수 없는 공통 컴포넌트: ${name}`);
        const html = templates[name].replace(/\{\{(\w+)\}\}/g, (_, key) => {
            if (!(key in data)) throw new Error(`${pageName}/${name}: ${key} 값 없음`);
            return data[key];
        });
        return `${indent}<!-- 공통: ${name} -->\n${html.split('\n').map(line => indent + line).join('\n')}\n${indent}<!-- /공통: ${name} -->`;
    });
    if (/\{\{\w+\}\}/.test(after)) throw new Error(`${pageName}: 치환하지 않은 값`);
    if (after !== before) {
        stale = true;
        if (!check) await writeFile(file, after);
        console.log(`${check ? '동기화 필요' : '동기화 완료'}: ${pageName}.html`);
    }
}
if (check && stale) process.exitCode = 1;
else if (!stale) console.log('공통 컴포넌트 4개 페이지 일치');
