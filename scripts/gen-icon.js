const { Resvg } = require('@resvg/resvg-js')
const fs = require('fs')

// "LA" as bold geometric paths (no font dependency)
// L: left vertical bar + bottom horizontal bar
// A: triangle with cutout
const svg = `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" rx="48" fill="#F27638"/>
  <!-- L -->
  <rect x="53" y="68" width="22" height="120" rx="2" fill="white"/>
  <rect x="53" y="168" width="62" height="20" rx="2" fill="white"/>
  <!-- A -->
  <path d="M163 68 L203 188 L183 188 L175 166 L151 166 L143 188 L123 188 L163 68Z" fill="white"/>
  <path d="M163 102 L154 152 L172 152 Z" fill="#F27638"/>
</svg>`

const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } })
const png = resvg.render().asPng()
fs.writeFileSync('build/icon.png', png)
console.log('PNG done:', png.length, 'bytes')
