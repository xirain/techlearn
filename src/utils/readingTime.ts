export function getReadingTime(content: string): string {
  const wordsPerMinute = 200;
  // Count CJK characters as 1 word, latin words normally
  const cjk = content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length || 0;
  const latin = content
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, "")
    .split(/\s+/)
    .filter(Boolean).length;
  const totalWords = cjk + latin;
  const minutes = Math.max(1, Math.ceil(totalWords / wordsPerMinute));
  return `${minutes} 分钟`;
}
