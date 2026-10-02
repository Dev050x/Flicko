use anchor_lang::prelude::*;

use crate::{error::ErrorCode, ATTESTATION_PREFIX};

const OFFSETS_START: usize = 2;
const OFFSETS_LEN: usize = 14;
const PUBKEY_LEN: usize = 32;
const SIGNATURE_LEN: usize = 64;
const CURRENT_INSTRUCTION: u16 = u16::MAX;

pub fn attestation_message(
    creator: &Pubkey,
    image_hash: &[u8; 32],
    expires_at: i64,
    name: &str,
    symbol: &str,
    uri: &str,
) -> Vec<u8> {
    let mut message = Vec::with_capacity(
        ATTESTATION_PREFIX.len() + 72 + 3 + name.len() + symbol.len() + uri.len(),
    );
    message.extend_from_slice(ATTESTATION_PREFIX);
    message.extend_from_slice(creator.as_ref());
    message.extend_from_slice(image_hash);
    message.extend_from_slice(&expires_at.to_le_bytes());
    for field in [name, symbol, uri] {
        message.push(field.len() as u8);
        message.extend_from_slice(field.as_bytes());
    }
    message
}

fn read_u16(data: &[u8], at: usize) -> Result<u16> {
    let bytes = data
        .get(at..at + 2)
        .ok_or(error!(ErrorCode::InvalidAttestation))?;
    Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
}

fn slice(data: &[u8], offset: u16, len: usize) -> Result<&[u8]> {
    let start = offset as usize;
    data.get(start..start + len)
        .ok_or(error!(ErrorCode::InvalidAttestation))
}

pub fn check_ed25519_data(data: &[u8], authority: &Pubkey, message: &[u8]) -> Result<()> {
    require!(
        data.len() >= OFFSETS_START + OFFSETS_LEN && data[0] == 1,
        ErrorCode::InvalidAttestation
    );
    let field = |index: usize| read_u16(data, OFFSETS_START + index * 2);
    let signature_offset = field(0)?;
    let public_key_offset = field(2)?;
    let message_offset = field(4)?;
    let message_size = field(5)?;
    for index in [1, 3, 6] {
        require!(
            field(index)? == CURRENT_INSTRUCTION,
            ErrorCode::InvalidAttestation
        );
    }
    slice(data, signature_offset, SIGNATURE_LEN)?;
    require!(
        slice(data, public_key_offset, PUBKEY_LEN)? == authority.as_ref(),
        ErrorCode::InvalidAttestation
    );
    require!(
        message_size as usize == message.len()
            && slice(data, message_offset, message.len())? == message,
        ErrorCode::InvalidAttestation
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ed25519_data(pubkey: &[u8], message: &[u8], index: u16) -> Vec<u8> {
        let header = (OFFSETS_START + OFFSETS_LEN) as u16;
        let pubkey_offset = header;
        let signature_offset = pubkey_offset + PUBKEY_LEN as u16;
        let message_offset = signature_offset + SIGNATURE_LEN as u16;
        let mut data = vec![1, 0];
        for value in [
            signature_offset,
            index,
            pubkey_offset,
            index,
            message_offset,
            message.len() as u16,
            index,
        ] {
            data.extend_from_slice(&value.to_le_bytes());
        }
        data.extend_from_slice(pubkey);
        data.extend_from_slice(&[7u8; SIGNATURE_LEN]);
        data.extend_from_slice(message);
        data
    }

    fn sample() -> (Pubkey, Vec<u8>) {
        let message = attestation_message(
            &Pubkey::new_from_array([2; 32]),
            &[3; 32],
            1_800_000_000,
            "Gm Ser",
            "GMS",
            "https://x/m.json",
        );
        (Pubkey::new_from_array([9; 32]), message)
    }

    #[test]
    fn message_layout_is_prefix_creator_hash_expiry_then_length_prefixed_fields() {
        let (_, message) = sample();
        assert_eq!(&message[..16], b"flicko:create:v1");
        assert_eq!(&message[16..48], &[2; 32]);
        assert_eq!(&message[48..80], &[3; 32]);
        assert_eq!(&message[80..88], &1_800_000_000i64.to_le_bytes());
        assert_eq!(message[88], 6);
        assert_eq!(&message[89..95], b"Gm Ser");
        assert_eq!(message[95], 3);
        assert_eq!(message.len(), 88 + 1 + 6 + 1 + 3 + 1 + 16);
    }

    #[test]
    fn accepts_matching_authority_and_message() {
        let (authority, message) = sample();
        let data = ed25519_data(authority.as_ref(), &message, CURRENT_INSTRUCTION);
        assert!(check_ed25519_data(&data, &authority, &message).is_ok());
    }

    #[test]
    fn rejects_other_signer_other_message_and_foreign_offsets() {
        let (authority, message) = sample();
        let other = ed25519_data(&[8; 32], &message, CURRENT_INSTRUCTION);
        assert!(check_ed25519_data(&other, &authority, &message).is_err());

        let mut tampered = message.clone();
        *tampered.last_mut().unwrap() ^= 1;
        let data = ed25519_data(authority.as_ref(), &tampered, CURRENT_INSTRUCTION);
        assert!(check_ed25519_data(&data, &authority, &message).is_err());

        let foreign = ed25519_data(authority.as_ref(), &message, 0);
        assert!(check_ed25519_data(&foreign, &authority, &message).is_err());

        assert!(check_ed25519_data(&[1, 0, 1], &authority, &message).is_err());
        let mut two = ed25519_data(authority.as_ref(), &message, CURRENT_INSTRUCTION);
        two[0] = 2;
        assert!(check_ed25519_data(&two, &authority, &message).is_err());
    }
}
