/**
 * 웹 체험판을 GitHub Pages(gh-pages 브랜치)에 배포
 *   npm run deploy:web
 * dist/ 를 빌드해 gh-pages 브랜치로 강제 푸시합니다(이 브랜치는 배포 결과물만 담음).
 * 공개 주소: https://llutar-design.github.io/ai-future-lab/
 */
import { execSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

const run = (cmd, cwd = '.') => execSync(cmd, { cwd, stdio: 'inherit' });
const remote = execSync('git remote get-url origin').toString().trim();
const commit = execSync('git rev-parse --short HEAD').toString().trim();

run('npm run build');
writeFileSync('dist/.nojekyll', ''); // GitHub Pages가 파일을 가공하지 않도록
rmSync('dist/.git', { recursive: true, force: true });
run('git init -q -b gh-pages', 'dist');
run('git add -A', 'dist');
run(`git -c user.name=llutar-design -c user.email=305720252+llutar-design@users.noreply.github.com commit -q -m "웹 체험판 배포 (${commit})"`, 'dist');
run(`git push -q -f ${remote} gh-pages`, 'dist');
rmSync('dist/.git', { recursive: true, force: true });
console.log('배포 완료: https://llutar-design.github.io/ai-future-lab/ (반영까지 1~2분)');
