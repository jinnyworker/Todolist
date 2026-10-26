import { useCallback, useEffect, useState } from 'react';

import type { ShareInput } from '@shared/types';

import { api, call, errorMessage, isCanceled } from '../utils/api';
import { readPref, writePref } from '../utils/storage';
import { Modal } from './Modal';
import { useToast } from './Toast';

type Format = 'text' | 'image';

interface ShareModalProps {
  title: string;
  scope: { scope: 'day'; date: string } | { scope: 'week'; weekStart: string };
  /** 이미지로 캡처할 화면 영역의 CSS 선택자 */
  captureSelector: string;
  onClose: () => void;
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** SCR-08 공유: 텍스트 또는 이미지로 클립보드 복사·PNG 저장 */
export function ShareModal({ title, scope, captureSelector, onClose }: ShareModalProps) {
  const toast = useToast();
  const [format, setFormat] = useState<Format>(() => (readPref('shareFormat', 'text') === 'image' ? 'image' : 'text'));
  const [text, setText] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** 이미지 캡처 중에는 모달을 숨겨 화면만 찍히게 한다. 보이는 영역만 캡처된다. */
  const request = useCallback(
    async (target: ShareInput['target']) => {
      if (format === 'text') return call(api.share.export({ ...scope, format, target }));
      setCapturing(true);
      try {
        await nextFrame();
        await nextFrame();
        const el = document.querySelector(captureSelector);
        if (!el) throw new Error('캡처할 화면을 찾지 못했습니다.');
        const r = el.getBoundingClientRect();
        const x = Math.max(0, r.left);
        const y = Math.max(0, r.top);
        const rect = {
          x,
          y,
          width: Math.min(r.right, window.innerWidth) - x,
          height: Math.min(r.bottom, window.innerHeight) - y,
        };
        return await call(api.share.export({ ...scope, format, target, rect }));
      } finally {
        setCapturing(false);
      }
    },
    [format, scope, captureSelector],
  );

  useEffect(() => {
    writePref('shareFormat', format);
    setError(null);
    request('preview')
      .then((r) => {
        setText(r.text);
        setImageUrl(r.imageDataUrl);
      })
      .catch((err) => setError(errorMessage(err)));
    // scope 객체는 매 렌더 새로 만들어지므로 format 변경 때만 미리보기를 다시 만든다.
  }, [format]);

  const run = async (target: 'clipboard' | 'file'): Promise<void> => {
    setBusy(true);
    try {
      const result = await request(target);
      toast(target === 'file' ? `저장했습니다: ${result.path}` : '복사되었습니다.');
      onClose();
    } catch (err) {
      if (!isCanceled(err)) setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`공유 · ${title}`}
      hidden={capturing}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            닫기
          </button>
          {format === 'image' && (
            <button type="button" className="button" disabled={busy || !!error} onClick={() => run('file')}>
              PNG로 저장
            </button>
          )}
          <button
            type="button"
            className="button button--primary"
            disabled={busy || !!error}
            onClick={() => run('clipboard')}
          >
            클립보드 복사
          </button>
        </>
      }
    >
      <div className="form__inline" role="radiogroup" aria-label="형식">
        <span className="field__label">형식</span>
        {(['text', 'image'] as Format[]).map((f) => (
          <label key={f} className="check">
            <input type="radio" name="share-format" checked={format === f} onChange={() => setFormat(f)} />
            {f === 'text' ? '텍스트' : '이미지'}
          </label>
        ))}
      </div>
      <div className="share-preview">
        {error ? (
          <p className="field__error">공유 내용을 만들지 못했습니다. {error}</p>
        ) : format === 'text' ? (
          text === null ? <div className="skeleton" /> : <pre className="share-preview__text">{text}</pre>
        ) : imageUrl === null ? (
          <div className="skeleton" />
        ) : (
          <img className="share-preview__image" src={imageUrl} alt="공유 이미지 미리보기" />
        )}
      </div>
      {format === 'image' && <p className="field__hint">화면에 보이는 영역만 이미지로 만듭니다.</p>}
    </Modal>
  );
}
