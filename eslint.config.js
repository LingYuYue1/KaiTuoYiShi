// ESLint flat config — 内核重写验收关卡（ideal_design.md §12）。
// 定位：最严规则集，全量硬性规则。新增违规即 error。
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'public/**',
      'node_modules/**',
      'backups/**',
      '.tmp/**',
      '.opencode/**',
      'workers/**/*.worker.ts', // worker 全局环境与主线程不同，暂不纳入类型感知检查
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // ---- A 档：禁绝易滥用 TS/JS 特性（现状为零或近零）----
      'no-restricted-syntax': [
        'error',
        { selector: 'ClassDeclaration', message: '禁止 class（ErrorBoundary 等存量除外），用工厂函数 + 对象字面量。' },
        { selector: 'TSEnumDeclaration', message: '禁止 enum，用 union type 或 const object。' },
        { selector: 'TSModuleDeclaration', message: '禁止 namespace。' },
        { selector: 'Decorator', message: '禁止装饰器。' },
        { selector: 'TSParameterProperty', message: '禁止构造函数参数属性。' },
        { selector: 'TSConditionalType', message: '禁止条件类型体操，类型应保持直白。' },
        { selector: 'ExportDefaultDeclaration', message: '禁止 default export（vite.config.ts 除外），具名导出保证 import 关系可 grep（戒律 3）。' },
      ],
      'no-var': 'error',
      eqeqeq: 'error',
      'prefer-const': 'error',
      'guard-for-in': 'error',
      // 戒律 8 的 lint 化身：reduce 路径禁止原地修改入参
      'no-param-reassign': ['error', { props: true }],

      // ---- 显式收紧的 typescript-eslint 规则 ----
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // ---- 关闭与项目约定冲突的风格型规则 ----
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],

      // ---- React Hooks 规则（请对照 eslint-plugin-react-hooks v7 的 recommended-latest 基准）----
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/refs': 'error',
      'react-hooks/set-state-in-render': 'error',
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/void-use-memo': 'error',
      'react-hooks/unsupported-syntax': 'warn',
    },
  },
  {
    // L1 模块边界（片 5a-2 D5）：管线模块（stage*.ts / sendWorkflow.ts）不得写 checkpoint 表。
    // checkpoint 写入统一收敛到 commitTurn（hooks/useGame/commitTurn.ts）与存档树基础设施（services/storage/saveTree.ts）；
    // 此规则只约束管线模块直接 import saveGame，saveSetting 等其余导出不禁。
    files: ['hooks/useGame/stage*.ts', 'hooks/useGame/sendWorkflow.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@/services/storage/saveCrud',
          importNames: ['saveGame'],
          message: 'L1 边界：管线模块不得 import saveGame，checkpoint 写入收敛到 commitTurn 与 saveTree。',
        }],
      }],
    },
  },
  {
    // vite.config.ts 是工具链入口，default export 为其约定
    files: ['vite.config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
);
