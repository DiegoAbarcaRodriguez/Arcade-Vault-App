"use server";

import { Resend } from "resend";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_RECIPIENT = "abarcarodriguezdiego@gmail.com";
const CONTACT_SENDER = "onboarding@resend.dev";

export interface ContactFormState {
  status: "idle" | "success" | "error";
  error?: string;
  name?: string;
}

export async function sendContactMessage(
  prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const msg = String(formData.get("msg") ?? "").trim();

  if (!name || !email || !msg) {
    return { status: "error", error: "Completa todos los campos antes de enviar." };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { status: "error", error: "Ingresa un correo electrónico válido." };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { error } = await resend.emails.send({
      from: CONTACT_SENDER,
      to: CONTACT_RECIPIENT,
      replyTo: email,
      subject: `Nuevo mensaje de contacto de ${name}`,
      text: `Nombre: ${name}\nEmail: ${email}\n\nMensaje:\n${msg}`,
    });

    if (error) {
      return { status: "error", error: "No se pudo enviar el mensaje. Intenta de nuevo." };
    }
  } catch {
    return { status: "error", error: "No se pudo enviar el mensaje. Intenta de nuevo." };
  }

  return { status: "success", name };
}
