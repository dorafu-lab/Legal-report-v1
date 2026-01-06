import { GoogleGenAI, Type, Chat } from "@google/genai";
import { Patent, PatentStatus, PatentType } from "../types";
import * as pdfjsLib from 'pdfjs-dist';

// --- Fix for PDF.js Import Issue ---
// 在 ESM 環境 (如 esm.sh) 中，pdfjs-dist 的匯入結構可能會有所不同。
// 這裡同時檢查直接匯入與 default 屬性，確保能取得到正確的 Library 物件。
const pdf: any = (pdfjsLib as any).default || pdfjsLib;

// 設定 PDF Worker
// 必須正確設定 workerSrc 才能執行 PDF 文字解析
if (pdf.GlobalWorkerOptions) {
    pdf.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
} else {
    console.warn("PDF.js GlobalWorkerOptions not found, PDF parsing might fail.");
}

// 安全取得 API Key
const getApiKey = () => {
  try {
    return process.env.API_KEY;
  } catch (e) {
    return undefined;
  }
};

const apiKey = getApiKey();
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const SYSTEM_INSTRUCTION = `
你是一位專業的專利代理人。
請協助解析專利資訊，或是回答使用者的專利法律問題。
`;

// --- Regex Heuristic Parser (備用解析引擎) ---
// 當 API Key 無效或連線失敗時，使用此邏輯確保功能可用
const heuristicParse = (text: string): Partial<Patent> => {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  const find = (patterns: RegExp[]) => {
    for (const p of patterns) {
      const m = cleanText.match(p);
      if (m && m[1]) return m[1].trim();
    }
    return "";
  };

  // 1. 名稱
  let name = find([
    /專利名稱[:：\s]*([^\s]+(?:[\u4e00-\u9fa5a-zA-Z0-9\s]+)?)/,
    /\[54\]\s*發明名稱\s*([^\n]+)/,
    /Title[:：\s]*([^\n]+)/
  ]);
  if (!name && text.split('\n')[0].length < 50) name = text.split('\n')[0]; // 猜測第一行

  // 2. 號碼
  const appNumber = find([/申請號[:：\s]*(\d{8,}[A-Z0-9]*)/, /\[21\]\s*申請案號\s*([^\s]+)/]);
  const pubNumber = find([/公告號[:：\s]*([A-Z0-9]+)/, /公開號[:：\s]*([A-Z0-9]+)/, /證書號[:：\s]*([A-Z0-9]+)/]);

  // 3. 日期
  const datePattern = "(\\d{4}[\\-\\/\\.]\\d{1,2}[\\-\\/\\.]\\d{1,2})";
  const appDate = find([new RegExp(`申請日[:：\\s]*${datePattern}`), new RegExp(`\\[22\\]\\s*申請日\\s*${datePattern}`)]);
  const pubDate = find([new RegExp(`公告日[:：\\s]*${datePattern}`), new RegExp(`公開日[:：\\s]*${datePattern}`)]);

  // 4. 專利權人
  const patentee = find([
    /專利權人[:：\s]*([^\s]+)/,
    /申請人[:：\s]*([^\s]+)/,
    /\[73\]\s*專利權人\s*([^\s]+)/,
    /\[71\]\s*申請人\s*([^\s]+)/
  ]);

  // 5. 狀態與類型
  let status = PatentStatus.Active;
  if (text.match(/消滅|屆期|Expired|Lapsed/i)) status = PatentStatus.Expired;
  else if (text.match(/審查|Pending/i)) status = PatentStatus.Pending;

  let type = PatentType.Invention;
  if (text.match(/新型|Utility/i) || pubNumber.startsWith('M')) type = PatentType.Utility;
  if (text.match(/設計|Design/i) || pubNumber.startsWith('D')) type = PatentType.Design;

  // 6. 國家
  let country = "TW (台灣)";
  if (text.match(/US|美國/i) && !text.match(/中華民國|R.O.C/i)) country = "US (美國)";
  if (text.match(/CN|中國/i)) country = "CN (中國)";

  // 7. 計算
  let duration = "";
  let annuityDate = "";
  let annuityYear = 1;

  if (appDate) {
      const stdAppDate = appDate.replace(/\./g, '-').replace(/\//g, '-');
      const start = new Date(stdAppDate);
      if (!isNaN(start.getTime())) {
          const years = type === PatentType.Invention ? 20 : (type === PatentType.Utility ? 10 : 15);
          const end = new Date(start);
          end.setFullYear(start.getFullYear() + years);
          duration = `${stdAppDate} ~ ${end.toISOString().split('T')[0]}`;

          const today = new Date();
          const nextAnniversary = new Date(start);
          nextAnniversary.setFullYear(today.getFullYear());
          if (nextAnniversary < today) nextAnniversary.setFullYear(today.getFullYear() + 1);
          annuityDate = nextAnniversary.toISOString().split('T')[0];
          annuityYear = Math.max(1, today.getFullYear() - start.getFullYear() + 1);
      }
  }

  return {
    name: name || "未命名專利",
    patentee: patentee || "",
    country, status, type, appNumber, pubNumber, appDate, pubDate,
    duration, annuityDate, annuityYear, 
    inventor: "", link: ""
  };
};


/**
 * 發送訊息給 AI
 */
export const sendMessageToGemini = async (message: string, contextPatents?: Patent[]): Promise<string> => {
  if (!ai) return "系統提示：API Key 未設定，無法使用 AI 對話功能。";
  
  try {
    const chat = ai.chats.create({
      model: 'gemini-2.5-flash-latest',
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });

    let fullMessage = message;
    if (contextPatents && contextPatents.length > 0) {
      const contextSummary = JSON.stringify(contextPatents.slice(0, 10).map(p => ({
        name: p.name, status: p.status, annuityDate: p.annuityDate
      })));
      fullMessage = `參考這些專利案件: ${contextSummary}\n\n使用者的問題: ${message}`;
    }
    const response = await chat.sendMessage({ message: fullMessage });
    return response.text || "無回應";
  } catch (error) {
    console.error("Chat Error", error);
    return "連線錯誤，請稍後再試。";
  }
};

/**
 * 解析專利文字 (AI 優先 -> Regex 備援)
 */
export const parsePatentFromText = async (text: string): Promise<Partial<Patent> | null> => {
  // 1. 嘗試 AI 解析
  if (ai) {
    try {
      const prompt = `Extract patent info from text to JSON. 
      Fields: name, patentee, country(e.g. TW), status(Active/Expired/Pending), type(Invention/Utility/Design), appNumber, pubNumber, appDate(YYYY-MM-DD), pubDate(YYYY-MM-DD), inventor.
      Text: ${text.substring(0, 5000)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-latest',
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      
      if (response.text) {
        const data = JSON.parse(response.text);
        
        // 簡單的資料後處理
        let status = PatentStatus.Pending;
        if (data.status?.match(/Active|存續/i)) status = PatentStatus.Active;
        if (data.status?.match(/Expired|屆期/i)) status = PatentStatus.Expired;

        let type = PatentType.Invention;
        if (data.type?.match(/Utility|新型/i)) type = PatentType.Utility;
        if (data.type?.match(/Design|設計/i)) type = PatentType.Design;

        return { ...data, status, type };
      }
    } catch (error) {
      console.warn("AI Parsing failed, falling back to Regex", error);
    }
  }

  // 2. 降級使用 Regex 解析
  console.log("Using Heuristic Parser");
  return new Promise(resolve => {
      setTimeout(() => resolve(heuristicParse(text)), 300);
  });
};

/**
 * 解析 PDF 檔案
 */
export const parsePatentFromFile = async (base64Data: string, mimeType: string): Promise<Partial<Patent> | null> => {
  try {
    if (mimeType === 'application/pdf') {
      const binaryString = window.atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      
      // 使用已修正的 pdf 物件來呼叫 getDocument
      const loadingTask = pdf.getDocument({ data: bytes });
      const doc = await loadingTask.promise;
      let text = '';
      
      // 讀取前 3 頁
      const maxPages = Math.min(doc.numPages, 3);
      for (let i = 1; i <= maxPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
      }
      
      return parsePatentFromText(text);
    }
    return { name: "不支援的檔案格式" };
  } catch (e) {
    console.error("File Parse Error", e);
    return { name: "檔案解析失敗" };
  }
};