import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  Globe,
  Image as ImageIcon,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { makeUUID, useApp } from '../context/AppContext';
import { createDefaultHallRecord, HALL_LOGO_SRC } from '../data/seedData';
import { hasMissingBilingualPair, pickLocalized } from '../i18n/translations';
import { Hall, Language } from '../types';
import {
  isValidEmail,
  isValidHallPhone,
  isValidHttpUrl,
  isValidIntlWhatsApp,
  normalizeIntlWhatsAppInput,
} from '../utils/formatters';

type HallFormState = Omit<Hall, 'id' | 'created_at' | 'updated_at'> & { id?: string };

function hallToFormState(h: Hall): HallFormState {
  return {
    id: h.id,
    name: h.name || '',
    name_ur: h.name_ur || '',
    tagline_en: h.tagline_en || '',
    tagline_ur: h.tagline_ur || '',
    address: h.address || '',
    address_ur: h.address_ur || '',
    city: h.city || '',
    phone: h.phone || '',
    phone_secondary: h.phone_secondary || '',
    whatsapp: h.whatsapp || '',
    email: h.email || '',
    website: h.website || '',
    facebook_url: h.facebook_url || '',
    instagram_url: h.instagram_url || '',
    tiktok_url: h.tiktok_url || '',
    youtube_url: h.youtube_url || '',
    x_url: h.x_url || '',
    google_maps_url: h.google_maps_url || '',
    logo_url: h.logo_url || '',
    signature_url: h.signature_url || '',
    ntn: h.ntn || '',
    strn: h.strn || '',
    bank_account_title: h.bank_account_title || '',
    bank_name: h.bank_name || '',
    bank_iban: h.bank_iban || '',
    show_bank_details: Boolean(h.show_bank_details),
    invoice_footer_en: h.invoice_footer_en || '',
    invoice_footer_ur: h.invoice_footer_ur || '',
    terms_en: h.terms_en || '',
    terms_ur: h.terms_ur || '',
    booking_code_prefix: h.booking_code_prefix || 'MQ',
    invoice_prefix: h.invoice_prefix || 'INV',
    currency: h.currency || 'PKR',
    is_active: h.is_active !== false,
  };
}

function emptyNewHallFormState(): HallFormState {
  const base = createDefaultHallRecord('');
  return {
    name: '',
    name_ur: '',
    tagline_en: '',
    tagline_ur: '',
    address: '',
    address_ur: '',
    city: 'Karachi',
    phone: '',
    phone_secondary: '',
    whatsapp: '',
    email: '',
    website: '',
    facebook_url: '',
    instagram_url: '',
    tiktok_url: '',
    youtube_url: '',
    x_url: '',
    google_maps_url: '',
    logo_url: '',
    signature_url: '',
    ntn: '',
    strn: '',
    bank_account_title: '',
    bank_name: '',
    bank_iban: '',
    show_bank_details: false,
    invoice_footer_en: base.invoice_footer_en || '',
    invoice_footer_ur: base.invoice_footer_ur || '',
    terms_en: base.terms_en || '',
    terms_ur: base.terms_ur || '',
    booking_code_prefix: 'MQ2',
    invoice_prefix: 'INV2',
    currency: 'PKR',
    is_active: true,
  };
}

function validateHallForm(form: HallFormState, isUr: boolean, requirePrefixes: boolean): string | null {
  if (!form.name.trim()) {
    return isUr ? 'انگریزی ہال نام لازمی ہے۔' : 'Hall English name is required.';
  }
  if (!form.address.trim()) {
    return isUr ? 'ہال کا انگریزی پتہ لازمی ہے۔' : 'Hall English address is required.';
  }
  if (!form.phone.trim() || !isValidHallPhone(form.phone)) {
    return isUr
      ? 'درست بنیادی فون نمبر درج کریں (مثلاً 0300-1234567 یا 021-34567890)۔'
      : 'Enter a valid primary phone number (e.g. 0300-1234567 or 021-34567890).';
  }
  if (form.phone_secondary?.trim() && !isValidHallPhone(form.phone_secondary)) {
    return isUr
      ? 'دوسرا فون نمبر درست فارمیٹ میں درج کریں۔'
      : 'Enter a valid secondary phone number.';
  }
  if (form.whatsapp?.trim() && !isValidIntlWhatsApp(form.whatsapp)) {
    return isUr
      ? 'واٹس ایپ نمبر بین الاقوامی فارمیٹ 92XXXXXXXXXX میں درج کریں۔'
      : 'WhatsApp number must be in international format (e.g. 923001234567).';
  }
  if (!form.email.trim() || !isValidEmail(form.email)) {
    return isUr ? 'درست ای میل ایڈریس درج کریں۔' : 'Enter a valid email address.';
  }
  const urlFields: Array<{ val?: string; label: string }> = [
    { val: form.website, label: isUr ? 'ویب سائٹ' : 'Website URL' },
    { val: form.facebook_url, label: 'Facebook URL' },
    { val: form.instagram_url, label: 'Instagram URL' },
    { val: form.tiktok_url, label: 'TikTok URL' },
    { val: form.youtube_url, label: 'YouTube URL' },
    { val: form.x_url, label: 'X URL' },
    { val: form.google_maps_url, label: 'Google Maps URL' },
  ];
  for (const uf of urlFields) {
    if (uf.val?.trim() && !isValidHttpUrl(uf.val)) {
      return isUr
        ? `${uf.label} درست http:// یا https:// لنک ہونا چاہیے۔`
        : `${uf.label} must be a valid http:// or https:// URL.`;
    }
  }
  if (requirePrefixes) {
    if (!form.booking_code_prefix.trim()) {
      return isUr ? 'بکنگ کوڈ پریفکس لازمی ہے۔' : 'Booking code prefix is required.';
    }
    if (!form.invoice_prefix.trim()) {
      return isUr ? 'انوائس پریفکس لازمی ہے۔' : 'Invoice prefix is required.';
    }
  }
  return null;
}

const SafeHallImg: React.FC<{
  src: string;
  alt: string;
  className?: string;
}> = ({ src, alt, className = '' }) => {
  const isExternal = src.startsWith('http://') || src.startsWith('https://');
  return (
    <img
      src={src}
      alt={alt}
      crossOrigin={isExternal ? 'anonymous' : undefined}
      referrerPolicy="no-referrer"
      className={className}
    />
  );
};

interface LiveInvoiceHeaderPreviewProps {
  form: HallFormState;
  lang: Language;
}

const LiveInvoiceHeaderPreview: React.FC<LiveInvoiceHeaderPreviewProps> = ({ form, lang }) => {
  const [previewLang, setPreviewLang] = useState<Language>(lang);
  const isUr = previewLang === 'ur';
  const displayName = pickLocalized(form.name || 'Hall Name', form.name_ur, previewLang);
  const displayTagline = pickLocalized(form.tagline_en, form.tagline_ur, previewLang);
  const displayAddress = [
    pickLocalized(form.address, form.address_ur, previewLang),
    form.city?.trim(),
  ]
    .filter(Boolean)
    .join(', ');
  const displayFooter = pickLocalized(form.invoice_footer_en, form.invoice_footer_ur, previewLang);
  const phones = [form.phone?.trim(), form.phone_secondary?.trim()].filter(Boolean).join(' · ');

  return (
    <div className="rounded-2xl border border-slate-300 dark:border-slate-700/80 bg-white text-slate-900 p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {lang === 'ur' ? 'انوائس ہیڈر لائیو پیش نظارہ' : 'Live Invoice Header Preview'}
        </span>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5 bg-slate-50">
          <button
            type="button"
            onClick={() => setPreviewLang('en')}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
              previewLang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setPreviewLang('ur')}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
              previewLang === 'ur' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            اردو
          </button>
        </div>
      </div>

      <div dir={isUr ? 'rtl' : 'ltr'} className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-14 h-14 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
            {form.logo_url ? (
              <SafeHallImg src={form.logo_url} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-5 h-5 text-slate-400" />
            )}
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="text-base font-extrabold text-slate-900 truncate">{displayName}</div>
            {displayTagline && <div className="text-xs font-medium text-amber-700">{displayTagline}</div>}
            {displayAddress && <div className="text-[11px] text-slate-600">{displayAddress}</div>}
            <div className="text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
              {phones && <span>{phones}</span>}
              {form.whatsapp && <span>WhatsApp: +{form.whatsapp}</span>}
              {form.email && <span>{form.email}</span>}
              {form.website && <span>{form.website}</span>}
            </div>
          </div>
        </div>

        <div className="text-end shrink-0 text-[10px] text-slate-500 space-y-0.5">
          <div className="font-bold text-slate-800 text-xs">{form.invoice_prefix || 'INV'}-2026-0001</div>
          {form.ntn && <div>NTN: {form.ntn}</div>}
          {form.strn && <div>STRN: {form.strn}</div>}
        </div>
      </div>

      {form.show_bank_details && (form.bank_name || form.bank_account_title || form.bank_iban) && (
        <div
          dir={isUr ? 'rtl' : 'ltr'}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700"
        >
          <span className="font-bold">{isUr ? 'بینک تفصیلات:' : 'Bank Details:'}</span>{' '}
          {[form.bank_name, form.bank_account_title, form.bank_iban].filter(Boolean).join(' · ')}
        </div>
      )}

      {(displayFooter || form.signature_url) && (
        <div
          dir={isUr ? 'rtl' : 'ltr'}
          className="pt-2 border-t border-slate-200 flex items-center justify-between gap-3 text-[11px] text-slate-500"
        >
          <span className="italic">{displayFooter}</span>
          {form.signature_url && (
            <SafeHallImg src={form.signature_url} alt="Signature" className="h-8 w-auto object-contain" />
          )}
        </div>
      )}
    </div>
  );
};

interface HallProfileFieldsFormProps {
  form: HallFormState;
  onChange: (next: HallFormState) => void;
  hallIdForUpload: string;
  isSuperAdmin: boolean;
  canEdit: boolean;
  lang: Language;
  onUploadAsset: (hallId: string, kind: 'logo' | 'signature', file: File) => Promise<{ ok: boolean; url?: string; error?: string }>;
  onError: (msg: string | null) => void;
}

const HallProfileFieldsForm: React.FC<HallProfileFieldsFormProps> = ({
  form,
  onChange,
  hallIdForUpload,
  isSuperAdmin,
  canEdit,
  lang,
  onUploadAsset,
  onError,
}) => {
  const isUr = lang === 'ur';
  const [uploadingKind, setUploadingKind] = useState<'logo' | 'signature' | null>(null);

  const handleFilePick = async (kind: 'logo' | 'signature', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canEdit) return;
    onError(null);
    setUploadingKind(kind);
    const res = await onUploadAsset(hallIdForUpload, kind, file);
    setUploadingKind(null);
    if (!res.ok || !res.url) {
      onError(res.error || (isUr ? 'تصویر اپلوڈ ناکام رہی۔' : 'Image upload failed.'));
      return;
    }
    onChange({
      ...form,
      [kind === 'logo' ? 'logo_url' : 'signature_url']: res.url,
    });
  };

  const setField = <K extends keyof HallFormState>(key: K, val: HallFormState[K]) => {
    onChange({ ...form, [key]: val });
  };

  return (
    <div className="space-y-5">
      {/* Section 1: Bilingual Identity & Location */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            {isUr ? 'بنیادی تعارف اور پتہ' : 'Hall Identity & Location'}
          </h4>
          {hasMissingBilingualPair(form.name, form.name_ur) && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              {isUr ? 'انگریزی اور اردو دونوں نام درج کریں' : 'Fill both EN & UR'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'ہال کا نام (انگریزی) *' : 'Hall Name (English) *'}</label>
            <input
              type="text"
              disabled={!canEdit}
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Marquee 1"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'ہال کا نام (اردو)' : 'Hall Name (Urdu)'}</label>
            <input
              type="text"
              dir="rtl"
              disabled={!canEdit}
              value={form.name_ur}
              onChange={(e) => setField('name_ur', e.target.value)}
              placeholder="مارکی 1 بینکوئٹ ہال"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400">{isUr ? 'ٹیگ لائن (انگریزی)' : 'Tagline (English)'}</label>
            <input
              type="text"
              disabled={!canEdit}
              value={form.tagline_en || ''}
              onChange={(e) => setField('tagline_en', e.target.value)}
              placeholder="Luxury Banquet & Event Venue"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'ٹیگ لائن (اردو)' : 'Tagline (Urdu)'}</label>
            <input
              type="text"
              dir="rtl"
              disabled={!canEdit}
              value={form.tagline_ur || ''}
              onChange={(e) => setField('tagline_ur', e.target.value)}
              placeholder="لگژری بینکوئٹ اور ایونٹ ہال"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400">{isUr ? 'مکمل پتہ (انگریزی) *' : 'Address (English) *'}</label>
            <input
              type="text"
              disabled={!canEdit}
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
              placeholder="Plot 14-C, Main Shahrah-e-Faisal, PECHS"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'مکمل پتہ (اردو)' : 'Address (Urdu)'}</label>
            <input
              type="text"
              dir="rtl"
              disabled={!canEdit}
              value={form.address_ur}
              onChange={(e) => setField('address_ur', e.target.value)}
              placeholder="پلاٹ 14-سی، مین شاہراہِ فیصل، کراچی"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400">{isUr ? 'شہر' : 'City'}</label>
            <input
              type="text"
              disabled={!canEdit}
              value={form.city || ''}
              onChange={(e) => setField('city', e.target.value)}
              placeholder="Karachi"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-400">{isUr ? 'بکنگ پریفکس' : 'Booking Prefix'}</label>
              <input
                type="text"
                disabled={!canEdit || !isSuperAdmin}
                value={form.booking_code_prefix}
                onChange={(e) => setField('booking_code_prefix', e.target.value.toUpperCase())}
                placeholder="MQ1"
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-sm text-white uppercase disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">{isUr ? 'انوائس پریفکس' : 'Invoice Prefix'}</label>
              <input
                type="text"
                disabled={!canEdit || !isSuperAdmin}
                value={form.invoice_prefix}
                onChange={(e) => setField('invoice_prefix', e.target.value.toUpperCase())}
                placeholder="INV"
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-sm text-white uppercase disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">{isUr ? 'کرنسی' : 'Currency'}</label>
              <input
                type="text"
                disabled={!canEdit || !isSuperAdmin}
                value={form.currency || 'PKR'}
                onChange={(e) => setField('currency', e.target.value.toUpperCase())}
                placeholder="PKR"
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-sm text-white uppercase disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Contact & WhatsApp */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
          <Phone className="w-4 h-4" />
          {isUr ? 'رابطہ اور واٹس ایپ' : 'Contact Details & WhatsApp'}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'بنیادی فون نمبر *' : 'Primary Phone *'}</label>
            <input
              type="text"
              dir="ltr"
              disabled={!canEdit}
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              placeholder="0300-2198844"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'متبادل فون نمبر' : 'Secondary Phone'}</label>
            <input
              type="text"
              dir="ltr"
              disabled={!canEdit}
              value={form.phone_secondary || ''}
              onChange={(e) => setField('phone_secondary', e.target.value)}
              placeholder="021-34567890"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">
              {isUr ? 'واٹس ایپ (92XXXXXXXXXX)' : 'WhatsApp (92XXXXXXXXXX)'}
            </label>
            <input
              type="text"
              dir="ltr"
              disabled={!canEdit}
              value={form.whatsapp || ''}
              onChange={(e) => setField('whatsapp', normalizeIntlWhatsAppInput(e.target.value))}
              placeholder="923002198844"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'ای میل *' : 'Email *'}</label>
            <input
              type="email"
              dir="ltr"
              disabled={!canEdit}
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="bookings@marquee1.pk"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-400">{isUr ? 'ویب سائٹ' : 'Website'}</label>
            <input
              type="url"
              dir="ltr"
              disabled={!canEdit}
              value={form.website || ''}
              onChange={(e) => setField('website', e.target.value)}
              placeholder="https://marquee1.pk"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60"
            />
          </div>
        </div>
      </div>

      {/* Section 3: Logo & Signature Uploads */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            {isUr ? 'لوگو اور دستخط / مہر اپلوڈ' : 'Logo & Signature / Stamp'}
          </h4>
          {!form.logo_url && (
            <span className="text-[11px] text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              {isUr ? 'انوائس کے لیے لوگو ضروری ہے' : 'Logo recommended for invoices'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Logo upload */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl border border-slate-700 bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
              {form.logo_url ? (
                <SafeHallImg src={form.logo_url} alt="Hall Logo" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="w-6 h-6 text-slate-500" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="text-xs font-semibold text-white">
                {isUr ? 'ہال لوگو (PNG / JPG / WebP، زیادہ سے زیادہ 2MB)' : 'Hall Logo (PNG/JPG/WebP, max 2 MB)'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/35 text-cyan-300 text-xs font-medium cursor-pointer hover:bg-cyan-500/25">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingKind === 'logo' ? (isUr ? 'اپلوڈ ہو رہا ہے...' : 'Uploading...') : (isUr ? 'لوگو منتخب کریں' : 'Upload Logo')}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={uploadingKind !== null}
                      onChange={(e) => handleFilePick('logo', e)}
                    />
                  </label>
                )}
                {canEdit && form.logo_url && (
                  <button
                    type="button"
                    onClick={() => setField('logo_url', '')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-rose-300 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isUr ? 'ہٹائیں' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Signature / Stamp upload */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl border border-slate-700 bg-white flex items-center justify-center overflow-hidden shrink-0">
              {form.signature_url ? (
                <SafeHallImg src={form.signature_url} alt="Signature" className="w-full h-full object-contain p-1" />
              ) : (
                <ImageIcon className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="text-xs font-semibold text-white">
                {isUr ? 'اختیاری دستخط / مہر تصویر' : 'Optional Signature / Stamp Image'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/35 text-violet-300 text-xs font-medium cursor-pointer hover:bg-violet-500/25">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingKind === 'signature' ? (isUr ? 'اپلوڈ ہو رہا ہے...' : 'Uploading...') : (isUr ? 'مہر اپلوڈ کریں' : 'Upload Stamp')}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={uploadingKind !== null}
                      onChange={(e) => handleFilePick('signature', e)}
                    />
                  </label>
                )}
                {canEdit && form.signature_url && (
                  <button
                    type="button"
                    onClick={() => setField('signature_url', '')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-rose-300 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isUr ? 'ہٹائیں' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Social Media & Google Maps */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
          <Globe className="w-4 h-4" />
          {isUr ? 'سوشل میڈیا اور گوگل میپس لنکس' : 'Social Media & Google Maps Links'}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-400">Facebook</label>
            <input
              type="url"
              dir="ltr"
              disabled={!canEdit}
              value={form.facebook_url || ''}
              onChange={(e) => setField('facebook_url', e.target.value)}
              placeholder="https://facebook.com/..."
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">Instagram</label>
            <input
              type="url"
              dir="ltr"
              disabled={!canEdit}
              value={form.instagram_url || ''}
              onChange={(e) => setField('instagram_url', e.target.value)}
              placeholder="https://instagram.com/..."
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">TikTok</label>
            <input
              type="url"
              dir="ltr"
              disabled={!canEdit}
              value={form.tiktok_url || ''}
              onChange={(e) => setField('tiktok_url', e.target.value)}
              placeholder="https://tiktok.com/@..."
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">YouTube</label>
            <input
              type="url"
              dir="ltr"
              disabled={!canEdit}
              value={form.youtube_url || ''}
              onChange={(e) => setField('youtube_url', e.target.value)}
              placeholder="https://youtube.com/@..."
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">X (Twitter)</label>
            <input
              type="url"
              dir="ltr"
              disabled={!canEdit}
              value={form.x_url || ''}
              onChange={(e) => setField('x_url', e.target.value)}
              placeholder="https://x.com/..."
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'گوگل میپس لنک' : 'Google Maps Link'}</label>
            <input
              type="url"
              dir="ltr"
              disabled={!canEdit}
              value={form.google_maps_url || ''}
              onChange={(e) => setField('google_maps_url', e.target.value)}
              placeholder="https://maps.google.com/..."
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
        </div>
      </div>

      {/* Section 5: Tax Registration & Bank Details */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
            <Landmark className="w-4 h-4" />
            {isUr ? 'ٹیکس نمبر اور بینک ادائیگی تفصیلات' : 'Tax Numbers & Bank Payment Details'}
          </h4>
          <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={Boolean(form.show_bank_details)}
              onChange={(e) => setField('show_bank_details', e.target.checked)}
              className="rounded border-slate-600 bg-slate-900 text-cyan-500"
            />
            <span>{isUr ? 'انوائس پر بینک تفصیلات پرنٹ کریں' : 'Print bank details on invoices'}</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-slate-400">NTN</label>
            <input
              type="text"
              dir="ltr"
              disabled={!canEdit}
              value={form.ntn || ''}
              onChange={(e) => setField('ntn', e.target.value)}
              placeholder="1234567-8"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">STRN</label>
            <input
              type="text"
              dir="ltr"
              disabled={!canEdit}
              value={form.strn || ''}
              onChange={(e) => setField('strn', e.target.value)}
              placeholder="32-77-8765-432-10"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'بینک کا نام' : 'Bank Name'}</label>
            <input
              type="text"
              disabled={!canEdit}
              value={form.bank_name || ''}
              onChange={(e) => setField('bank_name', e.target.value)}
              placeholder="Meezan Bank"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'اکاؤنٹ ٹائٹل' : 'Account Title'}</label>
            <input
              type="text"
              disabled={!canEdit}
              value={form.bank_account_title || ''}
              onChange={(e) => setField('bank_account_title', e.target.value)}
              placeholder="Marquee 1 Banquet"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">IBAN</label>
            <input
              type="text"
              dir="ltr"
              disabled={!canEdit}
              value={form.bank_iban || ''}
              onChange={(e) => setField('bank_iban', e.target.value)}
              placeholder="PK00MEZN0000000000000000"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
        </div>
      </div>

      {/* Section 6: Invoice Footer & Terms */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
          {isUr ? 'انوائس فوٹر اور شرائط و ضوابط' : 'Invoice Footer & Terms'}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'انوائس فوٹر (انگریزی)' : 'Invoice Footer (English)'}</label>
            <input
              type="text"
              disabled={!canEdit}
              value={form.invoice_footer_en || ''}
              onChange={(e) => setField('invoice_footer_en', e.target.value)}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'انوائس فوٹر (اردو)' : 'Invoice Footer (Urdu)'}</label>
            <input
              type="text"
              dir="rtl"
              disabled={!canEdit}
              value={form.invoice_footer_ur || ''}
              onChange={(e) => setField('invoice_footer_ur', e.target.value)}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'شرائط و ضوابط (انگریزی)' : 'Terms & Conditions (English)'}</label>
            <textarea
              rows={3}
              disabled={!canEdit}
              value={form.terms_en || ''}
              onChange={(e) => setField('terms_en', e.target.value)}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">{isUr ? 'شرائط و ضوابط (اردو)' : 'Terms & Conditions (Urdu)'}</label>
            <textarea
              rows={3}
              dir="rtl"
              disabled={!canEdit}
              value={form.terms_ur || ''}
              onChange={(e) => setField('terms_ur', e.target.value)}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const HallsView: React.FC = () => {
  const {
    rawDb,
    activeHall,
    activeHallId,
    setActiveHallId,
    currentUser,
    can,
    lang,
    saveHall,
    uploadHallAsset,
    manageUserWithEdgeFunction,
  } = useApp();

  const isUr = lang === 'ur';
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canEdit = can('halls', 'edit');

  // Admin-only single hall profile editor state
  const [adminForm, setAdminForm] = useState<HallFormState>(() => hallToFormState(activeHall));
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSaved, setAdminSaved] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);

  useEffect(() => {
    setAdminForm(hallToFormState(activeHall));
  }, [activeHall]);

  // Super Admin directory & modals state
  const [search, setSearch] = useState('');
  const [editingHall, setEditingHall] = useState<Hall | null>(null);
  const [editForm, setEditForm] = useState<HallFormState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [confirmToggleHall, setConfirmToggleHall] = useState<Hall | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  // Super Admin 3-step Add Hall Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardHallId, setWizardHallId] = useState<string>(() => makeUUID());
  const [wizardForm, setWizardForm] = useState<HallFormState>(() => emptyNewHallFormState());
  const [cloneFromHallId, setCloneFromHallId] = useState<string>('');
  const [wizardTaxPercent, setWizardTaxPercent] = useState<number>(0);
  const [wizardDefaultLang, setWizardDefaultLang] = useState<Language>('en');
  const [wizardBufferMin, setWizardBufferMin] = useState<number>(60);
  const [wizardCrateDeduct, setWizardCrateDeduct] = useState<number>(180);
  const [createdHallId, setCreatedHallId] = useState<string | null>(null);

  const [firstAdminName, setFirstAdminName] = useState('');
  const [firstAdminPhone, setFirstAdminPhone] = useState('');
  const [firstAdminEmail, setFirstAdminEmail] = useState('');
  const [firstAdminPassword, setFirstAdminPassword] = useState('');
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardBusy, setWizardBusy] = useState(false);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  const filteredHalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rawDb.halls;
    return rawDb.halls.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        (h.name_ur || '').toLowerCase().includes(q) ||
        (h.city || '').toLowerCase().includes(q) ||
        h.booking_code_prefix.toLowerCase().includes(q) ||
        h.invoice_prefix.toLowerCase().includes(q) ||
        h.phone.toLowerCase().includes(q) ||
        h.email.toLowerCase().includes(q)
    );
  }, [rawDb.halls, search]);

  const handleSaveAdminProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setAdminError(null);
    const err = validateHallForm(adminForm, isUr, false);
    if (err) {
      setAdminError(err);
      return;
    }
    setAdminSaving(true);
    const res = await saveHall({ ...adminForm, id: activeHall.id });
    setAdminSaving(false);
    if (!res.ok) {
      setAdminError(res.error || (isUr ? 'محفوظ کرنے میں خرابی آئی۔' : 'Failed to save hall profile.'));
      return;
    }
    setAdminSaved(true);
    setTimeout(() => setAdminSaved(false), 2500);
  };

  const openEditModal = (hall: Hall) => {
    setEditingHall(hall);
    setEditForm(hallToFormState(hall));
    setEditError(null);
  };

  const handleSaveEditHall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm || !editingHall) return;
    setEditError(null);
    const err = validateHallForm(editForm, isUr, true);
    if (err) {
      setEditError(err);
      return;
    }
    setEditSaving(true);
    const res = await saveHall({ ...editForm, id: editingHall.id });
    setEditSaving(false);
    if (!res.ok) {
      setEditError(res.error || (isUr ? 'ہال اپڈیٹ ناکام رہا۔' : 'Failed to update hall.'));
      return;
    }
    setEditingHall(null);
    setEditForm(null);
    setBannerSuccess(isUr ? 'ہال پروفائل کامیابی سے اپڈیٹ ہو گئی۔' : 'Hall profile updated successfully.');
    setTimeout(() => setBannerSuccess(null), 3000);
  };

  const handleConfirmToggleActive = async () => {
    if (!confirmToggleHall || togglingStatus) return;
    setTogglingStatus(true);
    try {
      const res = await saveHall({
        ...hallToFormState(confirmToggleHall),
        id: confirmToggleHall.id,
        is_active: !confirmToggleHall.is_active,
      });
      if (!res.ok) return;
      setConfirmToggleHall(null);
    } finally {
      setTogglingStatus(false);
    }
  };

  const openNewHallWizard = () => {
    setWizardHallId(makeUUID());
    setWizardForm(emptyNewHallFormState());
    setCloneFromHallId(rawDb.halls[0]?.id || '');
    setWizardTaxPercent(0);
    setWizardDefaultLang('en');
    setWizardBufferMin(60);
    setWizardCrateDeduct(180);
    setCreatedHallId(null);
    setFirstAdminName('');
    setFirstAdminPhone('');
    setFirstAdminEmail('');
    setFirstAdminPassword('');
    setWizardError(null);
    setWizardStep(1);
    setWizardOpen(true);
  };

  const handleWizardNextFromStep1 = () => {
    setWizardError(null);
    const err = validateHallForm(wizardForm, isUr, true);
    if (err) {
      setWizardError(err);
      return;
    }
    setWizardStep(2);
  };

  const handleWizardCreateHallStep2 = async () => {
    setWizardError(null);
    if (createdHallId) {
      setWizardStep(3);
      return;
    }
    setWizardBusy(true);
    const res = await saveHall(
      { ...wizardForm, id: wizardHallId },
      {
        cloneFromHallId: cloneFromHallId || undefined,
        initialSettingsOverrides: {
          tax_percent: Number(wizardTaxPercent) || 0,
          default_language: wizardDefaultLang,
          cleaning_buffer_minutes: Number(wizardBufferMin) || 60,
          crate_deduction_per_returned: Number(wizardCrateDeduct) || 180,
        },
      }
    );
    setWizardBusy(false);
    if (!res.ok || !res.hall) {
      setWizardError(res.error || (isUr ? 'نیا ہال بنانے میں ناکامی۔' : 'Failed to create hall.'));
      return;
    }
    setCreatedHallId(res.hall.id);
    setWizardStep(3);
  };

  const handleWizardCreateFirstAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdHallId) return;
    setWizardError(null);
    if (!firstAdminName.trim() || !firstAdminEmail.trim() || firstAdminPassword.length < 6) {
      setWizardError(
        isUr
          ? 'ایڈمن کا نام، درست ای میل، اور کم از کم 6 حروف کا پاس ورڈ درج کریں۔'
          : 'Enter admin full name, valid email, and password (min 6 characters).'
      );
      return;
    }
    setWizardBusy(true);
    const res = await manageUserWithEdgeFunction({
      action: 'create_user',
      email: firstAdminEmail.trim().toLowerCase(),
      password: firstAdminPassword,
      full_name: firstAdminName.trim(),
      phone: firstAdminPhone.trim(),
      role: 'admin',
      hall_id: createdHallId,
    });
    setWizardBusy(false);
    if (!res.ok) {
      setWizardError(res.error || (isUr ? 'ہال ایڈمن اکاؤنٹ بنانے میں خرابی۔' : 'Failed to create Hall Admin account.'));
      return;
    }
    setWizardOpen(false);
    setActiveHallId(createdHallId);
    setBannerSuccess(
      isUr ? 'نیا ہال اور ہال ایڈمن کامیابی سے تیار ہو گئے۔' : 'New hall and Hall Admin account created.'
    );
    setTimeout(() => setBannerSuccess(null), 3500);
  };

  // =========================================================================
  // ADMIN VIEW: Single Own Hall Profile Editor
  // =========================================================================
  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isUr ? 'ہال پروفائل' : 'Hall Profile'}
              </h2>
              <p className="text-xs text-slate-400">
                {isUr
                  ? 'انوائسز، رسیدوں، رپورٹس اور واٹس ایپ یاددہانیوں کے لیے ہال کی معلومات اپڈیٹ کریں۔'
                  : 'Manage your hall branding, contact details, bank/tax info, and invoice terms.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 tabular-nums">
              {isUr ? 'بکنگ کوڈ:' : 'Booking Prefix:'} <strong className="text-cyan-300">{activeHall.booking_code_prefix}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 tabular-nums">
              {isUr ? 'انوائس:' : 'Invoice Prefix:'} <strong className="text-cyan-300">{activeHall.invoice_prefix}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300">
              {activeHall.currency || 'PKR'}
            </span>
          </div>
        </div>

        <LiveInvoiceHeaderPreview form={adminForm} lang={lang} />

        <form onSubmit={handleSaveAdminProfile} className="space-y-5">
          {adminError && (
            <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-200 text-xs">
              {adminError}
            </div>
          )}

          <HallProfileFieldsForm
            form={adminForm}
            onChange={setAdminForm}
            hallIdForUpload={activeHall.id}
            isSuperAdmin={false}
            canEdit={canEdit}
            lang={lang}
            onUploadAsset={uploadHallAsset}
            onError={setAdminError}
          />

          {canEdit && (
            <div className="flex items-center justify-end gap-3">
              {adminSaved && (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  {isUr ? 'پروفائل محفوظ ہو گئی' : 'Hall profile saved'}
                </span>
              )}
              <button
                type="submit"
                disabled={adminSaving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50"
              >
                {adminSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{adminSaving ? (isUr ? 'محفوظ ہو رہا ہے...' : 'Saving...') : (isUr ? 'ہال پروفائل محفوظ کریں' : 'Save Hall Profile')}</span>
              </button>
            </div>
          )}
        </form>
      </div>
    );
  }

  // =========================================================================
  // SUPER ADMIN VIEW: Halls Directory + Add Hall Wizard + Edit Modal
  // =========================================================================
  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {isUr ? 'ہالز اور برانچ مینجمنٹ' : 'Halls & Hall Profiles'}
            </h2>
            <p className="text-xs text-slate-400">
              {isUr
                ? 'نئے بینکوئٹ ہال شامل کریں، پروفائلز اپڈیٹ کریں، یا کسی ہال کو غیر فعال کریں۔'
                : 'Add new halls with complete profiles, edit branch details, or deactivate halls safely.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-2.5 left-3 rtl:left-auto rtl:right-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isUr ? 'ہال، شہر یا پریفکس تلاش کریں...' : 'Search hall, city, prefix...'}
              className="w-56 sm:w-64 bg-slate-900/80 border border-slate-800 rounded-xl py-2 pl-9 pr-3 rtl:pl-3 rtl:pr-9 text-xs text-white placeholder:text-slate-500"
            />
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={openNewHallWizard}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold hover:opacity-95 shadow-[0_0_20px_-6px_rgba(6,182,212,0.7)]"
            >
              <Plus className="w-4 h-4" />
              <span>{isUr ? 'نیا ہال شامل کریں' : 'Add Hall'}</span>
            </button>
          )}
        </div>
      </div>

      {bannerSuccess && (
        <div className="p-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{bannerSuccess}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredHalls.map((h) => {
          const isCurrent = h.id === activeHallId;
          const missingPair = hasMissingBilingualPair(h.name, h.name_ur);
          return (
            <div
              key={h.id}
              className={`glass-panel rounded-2xl p-5 border transition-colors flex flex-col justify-between gap-4 ${
                isCurrent ? 'border-cyan-500/50' : 'border-slate-800/80'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <SafeHallImg
                    src={h.logo_url || HALL_LOGO_SRC}
                    alt={h.name}
                    className="w-14 h-14 rounded-xl object-cover border border-amber-500/30 shrink-0"
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-white truncate">
                        {pickLocalized(h.name, h.name_ur, lang)}
                      </h3>
                      {missingPair && (
                        <span
                          title={isUr ? 'انگریزی اور اردو نام مکمل کریں' : 'Fill in both English and Urdu names'}
                          className="text-amber-400"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          h.is_active
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {h.is_active ? (isUr ? 'فعال' : 'Active') : (isUr ? 'غیر فعال' : 'Inactive')}
                      </span>
                    </div>
                    {(h.tagline_en || h.tagline_ur) && (
                      <div className="text-xs text-amber-300/90 truncate">
                        {pickLocalized(h.tagline_en, h.tagline_ur, lang)}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                      <span className="truncate">
                        {[pickLocalized(h.address, h.address_ur, lang), h.city].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-300">
                <div className="rounded-xl bg-slate-900/70 border border-slate-800 px-3 py-2">
                  <div className="text-[10px] text-slate-500">{isUr ? 'پریفکس / کرنسی' : 'Prefixes / Currency'}</div>
                  <div className="font-semibold text-cyan-300 tabular-nums">
                    {h.booking_code_prefix} · {h.invoice_prefix} · {h.currency || 'PKR'}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-900/70 border border-slate-800 px-3 py-2">
                  <div className="text-[10px] text-slate-500">{isUr ? 'فون / واٹس ایپ' : 'Phone / WhatsApp'}</div>
                  <div className="font-medium truncate tabular-nums">{h.phone}</div>
                </div>
                <div className="rounded-xl bg-slate-900/70 border border-slate-800 px-3 py-2 col-span-2 sm:col-span-1">
                  <div className="text-[10px] text-slate-500">{isUr ? 'ای میل' : 'Email'}</div>
                  <div className="font-medium truncate flex items-center gap-1">
                    <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                    <span className="truncate">{h.email}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/70">
                <button
                  type="button"
                  onClick={() => setActiveHallId(h.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isCurrent
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {isCurrent
                    ? (isUr ? 'منتخب شدہ ہال' : 'Active Workspace')
                    : (isUr ? 'اس ہال پر جائیں' : 'Switch To Hall')}
                </button>

                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(h)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 hover:border-cyan-500/40 text-xs font-medium"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{isUr ? 'ترمیم' : 'Edit Hall'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmToggleHall(h)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${
                        h.is_active
                          ? 'border-rose-500/35 text-rose-300 hover:bg-rose-500/10'
                          : 'border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/10'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{h.is_active ? (isUr ? 'غیر فعال کریں' : 'Deactivate') : (isUr ? 'فعال کریں' : 'Activate')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredHalls.length === 0 && (
          <div className="lg:col-span-2 glass-panel rounded-2xl p-10 text-center text-sm text-slate-400">
            {isUr ? 'کوئی ہال نہیں ملا۔' : 'No halls match your search.'}
          </div>
        )}
      </div>

      {/* Edit Hall Modal */}
      {editingHall && editForm && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-700 bg-[#0B1120] p-6 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  {isUr ? 'ہال پروفائل میں ترمیم' : `Edit Hall: ${editingHall.name}`}
                </h3>
                <p className="text-xs text-slate-400">
                  {isUr ? 'مکمل پروفائل، برانڈنگ اور انوائس تفصیلات اپڈیٹ کریں۔' : 'Update branch profile, branding assets, and invoice settings.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingHall(null);
                  setEditForm(null);
                }}
                className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <LiveInvoiceHeaderPreview form={editForm} lang={lang} />

            <form onSubmit={handleSaveEditHall} className="space-y-4">
              {editError && (
                <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-200 text-xs">
                  {editError}
                </div>
              )}

              <HallProfileFieldsForm
                form={editForm}
                onChange={setEditForm}
                hallIdForUpload={editingHall.id}
                isSuperAdmin={true}
                canEdit={true}
                lang={lang}
                onUploadAsset={uploadHallAsset}
                onError={setEditError}
              />

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.is_active}
                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                    className="rounded border-slate-600 bg-slate-900 text-cyan-500"
                  />
                  <span>{isUr ? 'ہال فعال ہے' : 'Hall is Active'}</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingHall(null);
                      setEditForm(null);
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs font-medium"
                  >
                    {isUr ? 'منسوخ' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {editSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{editSaving ? (isUr ? 'محفوظ ہو رہا ہے...' : 'Saving...') : (isUr ? 'تبدیلیاں محفوظ کریں' : 'Save Changes')}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate / Reactivate Confirmation Modal (No Hard Delete) */}
      {confirmToggleHall && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#0B1120] p-6 space-y-4">
            <h3 className="text-base font-bold text-white">
              {confirmToggleHall.is_active
                ? (isUr ? 'ہال غیر فعال کریں؟' : 'Deactivate Hall?')
                : (isUr ? 'ہال دوبارہ فعال کریں؟' : 'Activate Hall?')}
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              {confirmToggleHall.is_active
                ? isUr
                  ? `کیا آپ "${pickLocalized(confirmToggleHall.name, confirmToggleHall.name_ur, lang)}" کو غیر فعال کرنا چاہتے ہیں؟ ریکارڈز اور انوائسز محفوظ رہیں گی۔`
                  : `Deactivate "${confirmToggleHall.name}"? Existing bookings, invoices, and audit logs will remain preserved.`
                : isUr
                  ? `کیا آپ "${pickLocalized(confirmToggleHall.name, confirmToggleHall.name_ur, lang)}" کو دوبارہ فعال کرنا چاہتے ہیں؟`
                  : `Reactivate "${confirmToggleHall.name}" for operations?`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmToggleHall(null)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs font-medium"
              >
                {isUr ? 'منسوخ' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={togglingStatus}
                onClick={handleConfirmToggleActive}
                className={`px-4 py-2 rounded-xl text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 ${
                  confirmToggleHall.is_active ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {togglingStatus && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {togglingStatus
                    ? (isUr ? 'اپڈیٹ ہو رہا ہے...' : 'Updating...')
                    : confirmToggleHall.is_active
                      ? (isUr ? 'غیر فعال کریں' : 'Deactivate')
                      : (isUr ? 'فعال کریں' : 'Activate')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3-Step Add Hall Wizard */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-700 bg-[#0B1120] p-6 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span>{isUr ? 'نیا ہال شامل کرنے کا وزرڈ' : 'Add New Hall Wizard'}</span>
                </h3>
                <div className="flex items-center gap-2 mt-2 text-xs">
                  {[
                    { num: 1, label: isUr ? '1. ہال پروفائل' : '1. Hall Profile' },
                    { num: 2, label: isUr ? '2. کیٹلاگ و نرخ' : '2. Catalog & Defaults' },
                    { num: 3, label: isUr ? '3. پہلا ہال ایڈمن' : '3. First Hall Admin' },
                  ].map((s) => (
                    <span
                      key={s.num}
                      className={`px-2.5 py-1 rounded-lg font-medium ${
                        wizardStep === s.num
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : wizardStep > s.num
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-900 text-slate-500 border border-slate-800'
                      }`}
                    >
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {wizardError && (
              <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-200 text-xs">
                {wizardError}
              </div>
            )}

            {wizardStep === 1 && (
              <div className="space-y-4">
                <LiveInvoiceHeaderPreview form={wizardForm} lang={lang} />
                <HallProfileFieldsForm
                  form={wizardForm}
                  onChange={setWizardForm}
                  hallIdForUpload={wizardHallId}
                  isSuperAdmin={true}
                  canEdit={true}
                  lang={lang}
                  onUploadAsset={uploadHallAsset}
                  onError={setWizardError}
                />
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setWizardOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs font-medium"
                  >
                    {isUr ? 'منسوخ' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleWizardNextFromStep1}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold"
                  >
                    <span>{isUr ? 'اگلا مرحلہ' : 'Next Step'}</span>
                    <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                    <Copy className="w-4 h-4" />
                    {isUr ? 'کیٹلاگ اور کرایہ ٹیمپلیٹ منتخب کریں' : 'Catalog, Floors & Rent Table Source'}
                  </h4>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-300">
                      {isUr ? 'کسی موجودہ ہال سے سروسز، کرایہ اور کیٹیگریز کاپی کریں یا معیاری ٹیمپلیٹ استعمال کریں:' : 'Clone pricing, floors, event types & catalog from an existing hall, or start with standard defaults:'}
                    </label>
                    <select
                      value={cloneFromHallId}
                      onChange={(e) => setCloneFromHallId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white"
                    >
                      <option value="">
                        {isUr ? 'معیاری ڈیفالٹ ٹیمپلیٹ استعمال کریں' : 'Use Standard Default Templates'}
                      </option>
                      {rawDb.halls.map((h) => (
                        <option key={h.id} value={h.id}>
                          {isUr ? `کاپی کریں: ${pickLocalized(h.name, h.name_ur, lang)}` : `Clone from: ${h.name} (${h.booking_code_prefix})`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                    {isUr ? 'ابتدائی آپریشنل ترتیبات' : 'Initial Operational Defaults'}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-slate-400">{isUr ? 'ٹیکس (%)' : 'Default Tax %'}</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        value={wizardTaxPercent}
                        onChange={(e) => setWizardTaxPercent(Number(e.target.value))}
                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">{isUr ? 'ڈیفالٹ زبان' : 'Default Language'}</label>
                      <select
                        value={wizardDefaultLang}
                        onChange={(e) => setWizardDefaultLang(e.target.value as Language)}
                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                      >
                        <option value="en">English</option>
                        <option value="ur">اردو (Urdu)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">{isUr ? 'صفائی وقفہ (منٹ)' : 'Cleaning Buffer (min)'}</label>
                      <input
                        type="number"
                        min={0}
                        value={wizardBufferMin}
                        onChange={(e) => setWizardBufferMin(Number(e.target.value))}
                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">{isUr ? 'کریٹ کٹوتی (PKR)' : 'Crate Deduction (PKR)'}</label>
                      <input
                        type="number"
                        min={0}
                        value={wizardCrateDeduct}
                        onChange={(e) => setWizardCrateDeduct(Number(e.target.value))}
                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs font-medium"
                  >
                    <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                    <span>{isUr ? 'واپس' : 'Back'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={wizardBusy}
                    onClick={handleWizardCreateHallStep2}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {wizardBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>
                      {wizardBusy
                        ? (isUr ? 'ہال بن رہا ہے...' : 'Creating Hall...')
                        : (isUr ? 'ہال محفوظ کریں اور آگے بڑھیں' : 'Create Hall & Continue')}
                    </span>
                    {!wizardBusy && <ChevronRight className="w-4 h-4 rtl:rotate-180" />}
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <form onSubmit={handleWizardCreateFirstAdmin} className="space-y-4">
                <div className="p-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    {isUr
                      ? `ہال "${wizardForm.name}" تیار ہو چکا ہے۔ اب اس ہال کا پہلا ہال ایڈمن اکاؤنٹ بنائیں یا بعد کے لیے چھوڑ دیں۔`
                      : `Hall "${wizardForm.name}" has been created. Create its first Hall Admin account below, or skip for now.`}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    {isUr ? 'پہلا ہال ایڈمن بنائیں' : 'Create First Hall Admin'}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400">{isUr ? 'پورا نام *' : 'Full Name *'}</label>
                      <input
                        type="text"
                        value={firstAdminName}
                        onChange={(e) => setFirstAdminName(e.target.value)}
                        placeholder="Bilal Ahmed"
                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">{isUr ? 'فون نمبر' : 'Phone'}</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={firstAdminPhone}
                        onChange={(e) => setFirstAdminPhone(e.target.value)}
                        placeholder="0300-1234567"
                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">{isUr ? 'ای میل *' : 'Email *'}</label>
                      <input
                        type="email"
                        dir="ltr"
                        value={firstAdminEmail}
                        onChange={(e) => setFirstAdminEmail(e.target.value)}
                        placeholder="admin@newhall.pk"
                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">{isUr ? 'پاس ورڈ (کم از کم 6 حروف) *' : 'Password (min 6 chars) *'}</label>
                      <input
                        type="password"
                        value={firstAdminPassword}
                        onChange={(e) => setFirstAdminPassword(e.target.value)}
                        placeholder="••••••••"
                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setWizardOpen(false);
                      if (createdHallId) setActiveHallId(createdHallId);
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs font-medium"
                  >
                    {isUr ? 'چھوڑ دیں اور مکمل کریں' : 'Skip & Finish'}
                  </button>
                  <button
                    type="submit"
                    disabled={wizardBusy}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {wizardBusy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    <span>
                      {wizardBusy
                        ? (isUr ? 'ایڈمن بن رہا ہے...' : 'Creating Admin...')
                        : (isUr ? 'ہال ایڈمن بنائیں اور مکمل کریں' : 'Create Admin & Finish')}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
