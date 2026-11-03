"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useFinanceActions } from "@/components/company/finance-action-context";

export function FinanceProofUpload({entryId, direction, onUploaded}: {
  entryId: string; direction: string; onUploaded?: () => void;
}) {
  const t = useTranslations('FinanceUX');
  const {uploadFinanceDocument} = useFinanceActions();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  return <details className="rounded-lg border bg-slate-50 p-3">
    <summary className="cursor-pointer text-sm font-medium text-primary">{t('uploadProof')}</summary>
    <form className="mt-3 space-y-3" onSubmit={(event) => {
      event.preventDefault(); const form = event.currentTarget; const payload = new FormData(form);
      payload.set('entryId', entryId); payload.set('kind', direction === 'payable' ? 'transfer_proof' : 'bank_credit');
      payload.set('requestId', requestId); setError(''); setMessage('');
      start(async () => {
        try {
          const result = await uploadFinanceDocument(payload);
          if (result.error) { setError(result.error); return; }
          setMessage(t('proofUploaded')); setRequestId(crypto.randomUUID()); form.reset(); onUploaded?.();
        } catch { setError(t('retryError')); }
      });
    }}>
      <label className="block text-sm">{t('proofFile')}<input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm"/></label>
      <p className="text-xs text-muted-foreground">{t('proofFormats')}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
      <button disabled={pending} className="finance-button">{t(pending ? 'uploading' : 'uploadProof')}</button>
    </form>
  </details>;
}
