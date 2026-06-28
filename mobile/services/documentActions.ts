import { Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

// Very small Markdown -> HTML conversion for clean PDF / print output.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  for (let raw of lines) {
    const line = raw.replace(/\r$/, '');
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const inline = (t: string) =>
      escapeHtml(t)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>');

    if (heading) {
      if (inList) { out.push('</ul>'); inList = false; }
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (bullet) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else if (line.trim() === '') {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<br/>');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

function buildHtml(title: string, content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  @page { margin: 56px 48px; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; font-size: 13px; line-height: 1.6; }
  h1 { font-size: 20px; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 16px; margin-top: 18px; }
  h3 { font-size: 14px; margin-top: 14px; }
  p { margin: 6px 0; }
  ul { margin: 6px 0 6px 18px; }
  .footer { margin-top: 36px; font-size: 10px; color: #777; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
</style></head>
<body>
  ${markdownToHtml(content)}
  <div class="footer">Generated with LegalBridge — review with a licensed Nigerian lawyer before formal use.</div>
</body></html>`;
}

export async function copyDocument(content: string) {
  await Clipboard.setStringAsync(content);
}

/** Export to a PDF file and open the system share sheet on it. */
export async function shareDocumentPdf(title: string, content: string) {
  try {
    const { uri } = await Print.printToFileAsync({ html: buildHtml(title, content) });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
    } else {
      Alert.alert('Saved', `PDF created at:\n${uri}`);
    }
  } catch (e: any) {
    Alert.alert('Could not create PDF', e?.message ?? 'Please try again.');
  }
}

/** Open the native print dialog (lets the user pick a printer or save as PDF). */
export async function printDocument(title: string, content: string) {
  try {
    await Print.printAsync({ html: buildHtml(title, content) });
  } catch (e: any) {
    // User cancelling the print dialog throws on Android — ignore those.
    const msg = String(e?.message ?? '').toLowerCase();
    if (!msg.includes('cancel') && !msg.includes('did not complete')) {
      Alert.alert('Could not print', e?.message ?? 'Please try again.');
    }
  }
}
