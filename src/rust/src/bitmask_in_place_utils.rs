macro_rules! define_bitmask_or_with_self_offset_in_place {
    (
        $fn_name:ident,
        $iter:expr,
        $first_idx_expr:expr,
        $main_shift:tt,
        $last_shift_op:tt
    ) => {
        fn $fn_name(data: &mut [u64], offset: usize) {
            assert!(offset > 0 && offset < 64, "Offset must be in (0, 64).");
            let len = data.len();
            if len == 0 {
                return;
            }
            let last_shift = 64 - offset;

            // Handle the boundary word separately to avoid range checks and branching in the hot loop.
            let first_idx = $first_idx_expr(len);
            let mut last = data[first_idx];
            data[first_idx] |= data[first_idx] $main_shift offset;

            for i in $iter(len) {
                // Construct the mask, save the current word for the next iteration, and apply the mask.
                let mask = (data[i] $main_shift offset) | (last $last_shift_op last_shift);
                last = data[i];
                data[i] |= mask;
            }
        }
    };
}

define_bitmask_or_with_self_offset_in_place!(
    bitmask_or_with_self_offset_in_place_right,
    |len| 1..len,
    |_len| 0,
    <<,
    >>
);

define_bitmask_or_with_self_offset_in_place!(
    bitmask_or_with_self_offset_in_place_left,
    |len| (0..len - 1).rev(),
    |len| len - 1,
    >>,
    <<
);

/// Applies a bitwise OR operation with a self-offset to the given bitmask data in place.
/// The offset can be positive (right shift) or negative (left shift).
///
/// The original data is modified in place.
///
/// # Arguments
///
/// * `data` - The bitmask data to modify.
/// * `offset` - The offset to apply. The absolute value must be in the range (0, 64).
pub fn bitmask_or_with_self_offset_in_place(data: &mut [u64], offset: isize) {
    if offset > 0 {
        bitmask_or_with_self_offset_in_place_right(data, offset as usize);
    } else {
        bitmask_or_with_self_offset_in_place_left(data, (-offset) as usize);
    }
}
