// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

#![allow(clippy::upper_case_acronyms)]
#![allow(
    dead_code,
    non_upper_case_globals,
    non_snake_case,
    clippy::cognitive_complexity,
    clippy::empty_enum,
    clippy::too_many_lines,
    unknown_lints,
    clippy::borrow_as_ptr
)]

pub use PRStatus_PR_FAILURE as PR_FAILURE;
pub use PRStatus_PR_SUCCESS as PR_SUCCESS;

include!(concat!(env!("OUT_DIR"), "/nspr_types.rs"));
