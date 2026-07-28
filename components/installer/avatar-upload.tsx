"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveAvatar } from "@/lib/actions/account";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 5 * 1_024 * 1_024;

/**
 * Foto de perfil. El archivo sube directo del navegador al bucket `avatars`
 * para no pasar imágenes por la Server Action; después se registra la ruta.
 * Las políticas de Storage sólo dejan escribir en la carpeta propia.
 */
export function AvatarUpload({
  userId,
  fullName,
  publicUrl,
}: {
  userId: string;
  fullName: string;
  publicUrl: string | null;
}) {
  const t = useTranslations("Profile");
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(publicUrl);
  const [pending, startTransition] = useTransition();

  const initials = fullName
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

  const upload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("avatarOnlyImages"));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("avatarTooBig"));
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        toast.error(t("avatarFailed"));
        return;
      }

      const res = await saveAvatar(path);
      if (res.error) {
        // La fila no se actualizó: el archivo huérfano se limpia solo.
        await supabase.storage.from("avatars").remove([path]);
        toast.error(res.error);
        return;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setPreview(data.publicUrl);
      toast.success(t("avatarSaved"));
    });
  };

  const clear = () => {
    startTransition(async () => {
      const res = await saveAvatar(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setPreview(null);
      toast.success(t("avatarRemoved"));
    });
  };

  return (
    <div className="flex items-center gap-4">
      {preview ? (
        <Image
          src={preview}
          alt=""
          width={160}
          height={160}
          unoptimized
          className="size-20 shrink-0 rounded-full border object-cover"
        />
      ) : (
        <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xl font-semibold">
          {initials || "?"}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload(file);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
        >
          <Camera className="size-4" />
          {preview ? t("avatarChange") : t("avatarAdd")}
        </Button>
        {preview ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={clear}
            disabled={pending}
          >
            <Trash2 className="size-4" />
            {t("avatarRemove")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
