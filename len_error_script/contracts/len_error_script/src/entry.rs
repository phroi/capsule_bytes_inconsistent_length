// Import from `core` instead of from `std` since we are in no-std mode
use core::result::Result;

// Import CKB syscalls and structures
// https://docs.rs/ckb-std/
use ckb_std::{ckb_types::prelude::*, debug, high_level::load_script};

use crate::error::Error;

pub fn main() -> Result<(), Error> {
    let script = load_script()?;

    debug!("script.args().len(): {:#?}", script.args().len());
    debug!(
        "script.args().as_slice().len(): {:#?}",
        script.args().as_slice().len()
    );

    if script.args().len() != script.args().as_slice().len() {
        return Err(Error::DifferentLen);
    }

    Ok(())
}
