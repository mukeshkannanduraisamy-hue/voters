import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { Alert, Badge, Button, Modal, Textarea, useToast } from './ui';
import { Icon } from './icons';

export interface ExtractedPhone {
  number: string;
  formatted: string;
  name?: string;
}

/** Keeps only the last 10 digits, stripping country code (91) or leading 0. */
export function last10Digits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Extracts all valid 10-digit Indian mobile numbers (starting with 6, 7, 8, or 9) from any free text. */
export function extractPhoneNumbers(text: string): ExtractedPhone[] {
  if (!text || !text.trim()) return [];
  const found = new Set<string>();
  const results: ExtractedPhone[] = [];

  // Match sequences of digits that could be mobile numbers (with optional +91, 0, dashes, spaces)
  const regex = /(?:(?:\+91|0091|91|0)[\s-]*)?([6-9]\d{4}[\s-]?\d{5}|[6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4}|[6-9]\d{9})/g;
  const matches = text.match(regex) || [];

  for (const m of matches) {
    const clean = last10Digits(m);
    if (clean.length === 10 && /^[6-9]\d{9}$/.test(clean) && !found.has(clean)) {
      found.add(clean);
      results.push({
        number: clean,
        formatted: `${clean.slice(0, 5)} ${clean.slice(5)}`,
      });
    }
  }

  // Also check if entire raw string is a 10-digit number
  const stripped = text.replace(/\D/g, '');
  if (stripped.length >= 10) {
    const last10 = stripped.slice(-10);
    if (/^[6-9]\d{9}$/.test(last10) && !found.has(last10)) {
      found.add(last10);
      results.push({
        number: last10,
        formatted: `${last10.slice(0, 5)} ${last10.slice(5)}`,
      });
    }
  }

  return results;
}

/** Parses vCard (.vcf) formatted text into contact names and phone numbers. */
export function parseVCard(vcfText: string): ExtractedPhone[] {
  const lines = vcfText.split(/\r?\n/);
  const contacts: { name?: string; numbers: string[] }[] = [];
  let current: { name?: string; numbers: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('BEGIN:VCARD')) {
      current = { numbers: [] };
    } else if (trimmed.startsWith('END:VCARD')) {
      if (current && current.numbers.length > 0) contacts.push(current);
      current = null;
    } else if (current) {
      if (trimmed.startsWith('FN:') || trimmed.startsWith('FN;')) {
        current.name = trimmed.replace(/^FN[^:]*:/, '').trim();
      } else if (!current.name && (trimmed.startsWith('N:') || trimmed.startsWith('N;'))) {
        const parts = trimmed.replace(/^N[^:]*:/, '').split(';').filter(Boolean);
        current.name = parts.reverse().join(' ').trim();
      } else if (trimmed.startsWith('TEL')) {
        const rawNum = trimmed.replace(/^TEL[^:]*:/, '').trim();
        const extracted = extractPhoneNumbers(rawNum);
        for (const e of extracted) {
          if (!current.numbers.includes(e.number)) current.numbers.push(e.number);
        }
      }
    }
  }

  const out: ExtractedPhone[] = [];
  for (const c of contacts) {
    for (const num of c.numbers) {
      out.push({
        name: c.name,
        number: num,
        formatted: `${num.slice(0, 5)} ${num.slice(5)}`,
      });
    }
  }
  return out;
}

export function ContactImportModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (digits: string, contactName?: string) => void;
}) {
  const toast = useToast();
  const [pastedText, setPastedText] = useState('');
  const [detectedNumbers, setDetectedNumbers] = useState<ExtractedPhone[]>([]);
  const [pickingContact, setPickingContact] = useState(false);
  const [readingClipboard, setReadingClipboard] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContactPicker = typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

  // Update detected numbers whenever pasted text changes
  useEffect(() => {
    if (!pastedText.trim()) {
      setDetectedNumbers([]);
      return;
    }
    setDetectedNumbers(extractPhoneNumbers(pastedText));
  }, [pastedText]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPastedText('');
      setDetectedNumbers([]);
    }
  }, [open]);

  const selectNumber = (phone: ExtractedPhone) => {
    onSelect(phone.number, phone.name);
    toast.ok(
      'Phone number imported',
      phone.name ? `${phone.name} · ${phone.formatted}` : phone.formatted
    );
    onClose();
  };

  /** Native Device Contacts Picker (Android / Chrome) */
  const handleDeviceContacts = async () => {
    if (hasContactPicker) {
      try {
        setPickingContact(true);
        let props = ['tel'];
        if (typeof (navigator as any).contacts?.getProperties === 'function') {
          const supported = await (navigator as any).contacts.getProperties();
          props = ['tel', 'name'].filter((p) => supported.includes(p));
          if (!props.includes('tel')) props.push('tel');
        }
        const contacts = await (navigator as any).contacts.select(props, { multiple: false });
        if (contacts && contacts.length > 0) {
          const c = contacts[0];
          const rawTel = Array.isArray(c.tel) ? c.tel[0] : c.tel;
          const contactName = c.name ? (Array.isArray(c.name) ? c.name[0] : c.name) : undefined;
          if (rawTel) {
            const digits = last10Digits(String(rawTel));
            if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
              selectNumber({ number: digits, formatted: `${digits.slice(0, 5)} ${digits.slice(5)}`, name: contactName });
              return;
            } else if (digits.length > 0) {
              setPastedText(String(rawTel));
              toast.warn('Check phone number', `Imported: ${digits}. Please verify the 10 digits.`);
            } else {
              toast.bad('No telephone digits', 'Selected contact has no numeric phone number.');
            }
          } else {
            toast.bad('No telephone number', 'Selected contact has no telephone number.');
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          toast.bad('Could not open contacts', err?.message || 'Contact selection was interrupted.');
        }
      } finally {
        setPickingContact(false);
      }
      return;
    }

    if (isAndroid) {
      toast.info('Opening Contacts…', 'Pick the contact, copy their number, then paste it here.');
      window.location.href =
        'intent://contacts/#Intent;action=android.intent.action.PICK;type=vnd.android.cursor.dir/phone_v2;scheme=content;end';
      return;
    }

    toast.info(
      'Device Contacts',
      'This browser does not provide direct contact book access. Please copy the number from your contacts or WhatsApp and use the Paste option below.'
    );
  };

  /** One-click Clipboard Paste */
  const handlePasteClipboard = async () => {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      toast.warn('Clipboard access unavailable', 'Please paste manually into the text box below.');
      return;
    }

    try {
      setReadingClipboard(true);
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        toast.info('Clipboard is empty', 'Copy a contact or number from your phone/contacts first.');
        return;
      }
      setPastedText(text);
      const extracted = extractPhoneNumbers(text);
      if (extracted.length === 1) {
        selectNumber(extracted[0]);
        return;
      } else if (extracted.length > 1) {
        toast.ok(`${extracted.length} phone numbers found`, 'Select the correct number below.');
      } else {
        toast.warn('No 10-digit number detected', 'Check the text pasted into the box below.');
      }
    } catch {
      toast.bad('Clipboard permission denied', 'Please paste directly into the text box below.');
    } finally {
      setReadingClipboard(false);
    }
  };

  /** Import from .vcf contact card file */
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result ?? '');
      const parsed = parseVCard(content);
      if (parsed.length > 0) {
        setDetectedNumbers(parsed);
        toast.ok(`${parsed.length} contact number(s) found`, 'Select a number below.');
      } else {
        const regularExtract = extractPhoneNumbers(content);
        if (regularExtract.length > 0) {
          setDetectedNumbers(regularExtract);
          toast.ok(`${regularExtract.length} phone number(s) found in file`, 'Select a number below.');
        } else {
          toast.bad('No numbers found in file', 'Could not find any 10-digit phone numbers in this file.');
        }
      }
    };
    reader.onerror = () => {
      toast.bad('File read error', 'Could not read the selected file.');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Modal
      open={open}
      title="Import Phone Number / கைபேசி எண் இறக்குமதி"
      icon="phone"
      onClose={onClose}
      footer={<Button onClick={onClose}>Close / மூடு</Button>}
    >
      <div className="stack" style={{ gap: 'var(--sp-4, 16px)' }}>
        {/* Method 1: Device Contacts & Clipboard Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--sp-3, 12px)' }}>
          <Button
            type="button"
            variant="primary"
            icon="users"
            loading={pickingContact}
            onClick={() => void handleDeviceContacts()}
            style={{ justifyContent: 'center', height: 42 }}
          >
            {hasContactPicker ? 'Pick Device Contact' : 'Device Contacts'}
          </Button>

          <Button
            type="button"
            icon="clipboard"
            loading={readingClipboard}
            onClick={() => void handlePasteClipboard()}
            style={{ justifyContent: 'center', height: 42 }}
          >
            Paste from Clipboard
          </Button>
        </div>

        {/* Method 2: File Import Button (.vcf / contact card) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-3)', borderRadius: 'var(--r-md, 8px)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="upload" size={16} className="t-muted" />
            <div>
              <div className="t-sm t-semi">Import from Contact Card (.vcf)</div>
              <div className="t-xs t-muted">Select an exported vCard file from your device</div>
            </div>
          </div>
          <Button
            size="sm"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".vcf,.vcard,text/vcard,text/x-vcard"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {/* Method 3: Live Paste Box & Real-Time Extractor */}
        <div>
          <div className="t-sm t-semi mb-1">
            Or paste copied message / contact text here:
          </div>
          <Textarea
            rows={3}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste any text, WhatsApp message, or copied contact info here… e.g. Kumar: +91 98401 23456"
            style={{ width: '100%', fontSize: 'var(--fs-sm)' }}
          />
        </div>

        {/* Detected Phone Numbers */}
        {detectedNumbers.length > 0 && (
          <div style={{ background: 'var(--brand-50, #eff6ff)', border: '1px solid var(--brand-300, #93c5fd)', borderRadius: 'var(--r-md, 8px)', padding: '12px' }}>
            <div className="t-sm t-semi mb-2" style={{ color: 'var(--brand-900, #1e3a8a)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check-circle" size={16} />
              Detected Phone Number{detectedNumbers.length > 1 ? 's' : ''} (Tap to select):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {detectedNumbers.map((p, idx) => (
                <button
                  key={`${p.number}-${idx}`}
                  type="button"
                  onClick={() => selectNumber(p)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 14px',
                    background: 'var(--surface)',
                    border: '1.5px solid var(--brand-500, #3b82f6)',
                    borderRadius: 'var(--r-md, 8px)',
                    cursor: 'pointer',
                    boxShadow: 'var(--sh-sm)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--brand-700, #1d4ed8)';
                    e.currentTarget.style.background = 'var(--brand-100, #dbeafe)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--brand-500, #3b82f6)';
                    e.currentTarget.style.background = 'var(--surface)';
                  }}
                >
                  <Icon name="phone" size={14} className="t-brand" />
                  <span className="mono t-semi t-lg" style={{ color: 'var(--brand-800, #1e40af)' }}>
                    +91 {p.formatted}
                  </span>
                  {p.name && (
                    <Badge tone="muted">{p.name}</Badge>
                  )}
                  <Badge tone="brand">Select</Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        {pastedText.trim() && detectedNumbers.length === 0 && (
          <Alert tone="warn">
            No 10-digit Indian mobile number (starting with 6, 7, 8, or 9) was found in the text above. Please check and verify the number.
          </Alert>
        )}
      </div>
    </Modal>
  );
}
