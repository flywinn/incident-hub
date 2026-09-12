'use client';

import React, { useState, useMemo } from 'react';
import {
  parsePrtgRawOutput,
  groupAndSortAlarms,
  formatTelegramReport,
  TelegramTemplate,
  SortOption,
  ParsedAlarm,
  SAMPLE_PRTG_INPUT
} from '@/lib/prtgParser';

const TEMPLATES: { id: TelegramTemplate; label: string; persianLabel: string; icon: string; desc: string }[] = [
  {
    id: 'grouped-standard',
    label: 'Standard',
    persianLabel: 'استاندارد تلگرام',
    icon: '📋',
    desc: 'دسته‌بندی با هدر و فونت ضخیم',
  },
  {
    id: 'grouped-compact',
    label: 'Compact',
    persianLabel: 'فشرده بالت‌دار',
    icon: '⚡',
    desc: 'متراکم تک‌خطی بدون فاصله اضافی',
  },
  {
    id: 'clean-bullets',
    label: 'Clean Bullets',
    persianLabel: 'خطی ساده',
    icon: '🔘',
    desc: 'لیست تمیز با ایموجی بدون هدرهای بزرگ',
  },
  {
    id: 'noc-ticket',
    label: 'NOC Incident',
    persianLabel: 'تیکت شیفت NOC',
    icon: '🎫',
    desc: 'گزارش لاگ با آمار کل و خط‌کشی جداکننده',
  },
];

export default function PrtgToolSection() {
  const [rawInput, setRawInput] = useState<string>(SAMPLE_PRTG_INPUT);
  const [copied, setCopied] = useState<boolean>(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TelegramTemplate>('grouped-standard');
  const [boldValues, setBoldValues] = useState<boolean>(true);
  const [removeDuplicates, setRemoveDuplicates] = useState<boolean>(true);
  const [includeIp, setIncludeIp] = useState<boolean>(true);
  const [includeDowntime, setIncludeDowntime] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<SortOption>('original');
  const [botToken, setBotToken] = useState<string>('');
  const [chatId, setChatId] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  const alarms: ParsedAlarm[] = useMemo(() => {
    return parsePrtgRawOutput(rawInput);
  }, [rawInput]);

  const downCount = alarms.filter(a => a.status === 'Down').length;
  const warnCount = alarms.filter(a => a.status === 'Warning').length;

  const grouped = useMemo(() => {
    return groupAndSortAlarms(alarms, { sortBy, removeDuplicates });
  }, [alarms, sortBy, removeDuplicates]);

  const formattedReport = useMemo(() => {
    return formatTelegramReport(grouped, {
      template: selectedTemplate,
      boldValues,
      includeIp,
      includeDowntime,
    });
  }, [grouped, selectedTemplate, boldValues, includeIp, includeDowntime]);

  const handleCopy = async () => {
    if (!formattedReport) return;
    try {
      await navigator.clipboard.writeText(formattedReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleSendTelegram = async () => {
    if (!formattedReport) return;
    if (!botToken.trim() || !chatId.trim()) {
      setSendResult({ success: false, message: 'لطفاً Bot Token و Chat ID تلگرام را وارد کنید.' });
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/integrations/prtg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: rawInput,
          template: selectedTemplate,
          boldValues,
          includeIp,
          includeDowntime,
          sortBy,
          removeDuplicates,
          telegram_bot_token: botToken.trim(),
          telegram_chat_id: chatId.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.telegram?.ok) {
        setSendResult({ success: true, message: '✅ پیام با موفقیت به تلگرام ارسال شد!' });
      } else {
        setSendResult({ success: false, message: `خطای تلگرام: ${data.telegram?.description || data.telegram?.error || data.error || 'نامشخص'}` });
      }
    } catch (err: unknown) {
      setSendResult({ success: false, message: err instanceof Error ? err.message : 'خطا در ارسال به تلگرام' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="prtg-tool-container" dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1), rgba(59, 130, 246, 0.1))',
        border: '1px solid rgba(6, 182, 212, 0.3)',
        borderRadius: '12px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>
            ⚡ قالب‌ساز هوشمند آلارم‌های PRTG به تلگرام
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            ورودی خام PRTG را پیست کنید یا آلارم‌ها را خودکار به چت تلگرام یا گروه‌های پشتیبانی ارسال کنید.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{
            background: 'rgba(239, 68, 68, 0.2)',
            color: '#f87171',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            padding: '4px 10px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            🔴 {downCount} Down
          </span>
          <span style={{
            background: 'rgba(245, 158, 11, 0.2)',
            color: '#fbbf24',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            padding: '4px 10px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            🟡 {warnCount} Warning
          </span>
          <span style={{
            background: 'rgba(148, 163, 184, 0.1)',
            color: '#cbd5e1',
            padding: '4px 10px',
            borderRadius: '8px',
            fontSize: '12px'
          }}>
            مجموع: {alarms.length}
          </span>
        </div>
      </div>

      {/* Main Grid: Input & Output */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* Left: Raw Input */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(51, 65, 85, 0.8)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '14px', color: '#e2e8f0' }}>📥 متن خام آلارم‌های PRTG</strong>
            <button
              type="button"
              onClick={() => setRawInput('')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              پاک کردن
            </button>
          </div>

          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="خروجی لاگ یا جدول آلارم‌های PRTG را اینجا قرار دهید..."
            rows={14}
            dir="ltr"
            style={{
              width: '100%',
              background: '#020617',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '12px',
              color: '#38bdf8',
              fontFamily: 'monospace',
              fontSize: '12px',
              resize: 'vertical',
              lineHeight: '1.5',
              outline: 'none'
            }}
          />

          <div style={{ fontSize: '11px', color: '#64748b' }}>
            فرمت‌های پشتیبانی‌شده: جدول تب‌دار PRTG، خروجی‌های ایمیل آلارم، کپی مستقیم از وب و متن وب‌هوک
          </div>
        </div>

        {/* Right: Formatted Output & Direct Telegram Send */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(51, 65, 85, 0.8)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '14px', color: '#e2e8f0' }}>📤 پیام نهایی تلگرام</strong>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                background: copied ? '#10b981' : '#0ea5e9',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {copied ? 'کپی شد! ✓' : 'کپی متن گزارش 📋'}
            </button>
          </div>

          {/* Template Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {TEMPLATES.map((t) => {
              const isSelected = selectedTemplate === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTemplate(t.id)}
                  style={{
                    background: isSelected ? 'rgba(14, 165, 233, 0.2)' : 'rgba(30, 41, 59, 0.6)',
                    border: isSelected ? '1px solid #0ea5e9' : '1px solid #334155',
                    color: isSelected ? '#38bdf8' : '#cbd5e1',
                    borderRadius: '8px',
                    padding: '8px',
                    textAlign: 'right',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>{t.icon}</span>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{t.persianLabel}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>{t.label}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '11px', color: '#cbd5e1' }}>
            <label><input type="checkbox" checked={boldValues} onChange={(event) => setBoldValues(event.target.checked)} /> مقادیر ضخیم</label>
            <label><input type="checkbox" checked={removeDuplicates} onChange={(event) => setRemoveDuplicates(event.target.checked)} /> حذف تکراری‌ها</label>
            <label><input type="checkbox" checked={includeIp} onChange={(event) => setIncludeIp(event.target.checked)} /> نمایش IP</label>
            <label><input type="checkbox" checked={includeDowntime} onChange={(event) => setIncludeDowntime(event.target.checked)} /> نمایش Downtime</label>
            <label>
              مرتب‌سازی
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} style={{ marginInlineStart: '6px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '5px' }}>
                <option value="original">ترتیب ورودی</option>
                <option value="ip">IP</option>
                <option value="device">دستگاه</option>
                <option value="value">مقدار</option>
              </select>
            </label>
          </div>

          {/* Result Preview Box */}
          <textarea
            readOnly
            value={formattedReport || 'هیچ آلارمی دریافت نشد.'}
            rows={10}
            dir="ltr"
            style={{
              width: '100%',
              background: '#020617',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '12px',
              color: '#e2e8f0',
              fontFamily: 'monospace',
              fontSize: '12px',
              resize: 'vertical',
              lineHeight: '1.5',
              outline: 'none'
            }}
          />

          {/* Send Direct to Telegram Box */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px solid rgba(51, 65, 85, 0.5)',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#38bdf8' }}>
              🚀 ارسال مستقیم از همین صفحه به چت / گروه تلگرام:
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input
                type="password"
                placeholder="Telegram Bot Token"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                dir="ltr"
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#fff',
                  fontSize: '11px'
                }}
              />
              <input
                type="text"
                placeholder="Chat ID (مثال: -100123456789)"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                dir="ltr"
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#fff',
                  fontSize: '11px'
                }}
              />
            </div>
            <button
              type="button"
              disabled={sending}
              onClick={handleSendTelegram}
              style={{
                background: '#0284c7',
                color: '#fff',
                border: 'none',
                padding: '8px',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: sending ? 'wait' : 'pointer'
              }}
            >
              {sending ? 'در حال ارسال به تلگرام...' : 'ارسال به تلگرام ✈️'}
            </button>
            {sendResult && (
              <div style={{
                fontSize: '12px',
                color: sendResult.success ? '#4ade80' : '#f87171',
                marginTop: '4px'
              }}>
                {sendResult.message}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Webhook Guide Box */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(51, 65, 85, 0.8)',
        borderRadius: '12px',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <h3 style={{ margin: 0, fontSize: '14px', color: '#38bdf8' }}>
          🔗 آدرس وب‌هوک اختصاصی سامانه شما جهت تنظیم در خود PRTG:
        </h3>
        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
          در PRTG بخش <strong>Notification Template ➔ Execute HTTP Action</strong> آدرس زیر را قرار دهید تا آلارم‌ها بدون نیاز به باز کردن سایت، خودکار ارسال شوند:
        </p>
        <div style={{
          background: '#020617',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '10px 14px',
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#facc15',
          overflowX: 'auto'
        }} dir="ltr">
          https://YOUR-DOMAIN/api/integrations/prtg?secret=YOUR_PRTG_SECRET&template=grouped-standard
        </div>
        <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>
          توکن ربات و Chat ID در تنظیمات Production ذخیره می‌شوند. Postdata در PRTG: <code>%device %name %status %lastvalue</code>
        </p>
      </div>
    </div>
  );
}
