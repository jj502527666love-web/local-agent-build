/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // primary 各档引用 CSS 变量（由 utils/theme-color.ts 按云控端主色派生注入），
        // fallback 为品牌橙原值——未注入时外观与改造前完全一致
        primary: {
          50: 'var(--color-primary-50, #fff7f0)',
          100: 'var(--color-primary-100, #ffedd5)',
          200: 'var(--color-primary-200, #fed7aa)',
          300: 'var(--color-primary-300, #fdba74)',
          400: 'var(--color-primary-400, #f9974c)',
          500: 'var(--color-primary-500, #F27638)',
          600: 'var(--color-primary-600, #e5652a)',
          700: 'var(--color-primary-700, #c2491e)',
          800: 'var(--color-primary-800, #9a3a1e)',
          900: 'var(--color-primary-900, #7c311d)'
        },
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          4: 'var(--surface-4)'
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          disabled: 'var(--text-disabled)'
        }
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px'
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 4px 12px 0 rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.06)',
        'modal': '0 20px 60px -12px rgba(0, 0, 0, 0.15)'
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
}
