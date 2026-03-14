package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"os"

	"ojreviewdesktop/internal/app"
)

type Vault struct {
	key []byte
}

func LoadOrCreateVault(cfg app.Config) (*Vault, error) {
	key, err := os.ReadFile(cfg.MasterKeyPath)
	if err == nil {
		if len(key) != 32 {
			return nil, errors.New("invalid master key length")
		}
		return &Vault{key: key}, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}

	key = make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, err
	}
	if err := os.WriteFile(cfg.MasterKeyPath, key, 0o600); err != nil {
		return nil, err
	}
	return &Vault{key: key}, nil
}

func (v *Vault) Encrypt(value string) (string, error) {
	block, err := aes.NewCipher(v.key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(value), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func (v *Vault) Decrypt(value string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(v.key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce, cipherBody := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, cipherBody, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
