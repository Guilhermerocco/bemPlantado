"""Utilitários de texto para buscas por nome (sem acento, sem diferenciar maiúscula)."""
import unicodedata


def norm(texto):
    texto = unicodedata.normalize("NFKD", texto or "")
    return "".join(c for c in texto if not unicodedata.combining(c)).lower().strip()


def casa(nome, texto):
    """True se alguma palavra de `nome` começa com o que foi digitado em `texto`."""
    alvo = norm(texto)
    palavras = norm(nome).replace("-", " ").replace("(", " ").replace(")", " ").replace("'", " ").split()
    return len(alvo) >= 2 and any(p.startswith(alvo) for p in palavras)
