#[derive(Debug, PartialEq, Clone)]
pub enum IndexData<'a> {
    BitMask(&'a [u64]),
    List(&'a [u32]),
}

#[derive(Debug, PartialEq)]
pub enum IndexDataOwned {
    BitMask(Vec<u64>),
    List(Vec<u32>),
}

pub enum IndexDataRoO<'a> {
    Ref(IndexData<'a>),
    Owned(IndexDataOwned),
}

impl IndexDataRoO<'_> {
    pub fn to_ref(&'_ self) -> IndexData<'_> {
        match self {
            IndexDataRoO::Ref(r) => r.clone(),
            IndexDataRoO::Owned(o) => match o {
                IndexDataOwned::BitMask(v) => IndexData::BitMask(v),
                IndexDataOwned::List(v) => IndexData::List(v),
            },
        }
    }
}

pub fn u32_from_bytes(bytes: &[u8]) -> Result<&[u32], String> {
    let (left, data, right) = unsafe { bytes.align_to::<u32>() };
    if !left.is_empty() || !right.is_empty() {
        return Err("data is not properly aligned".to_string());
    }
    Ok(data)
}

pub fn u64_from_bytes(bytes: &[u8]) -> Result<&[u64], String> {
    let (left, data, right) = unsafe { bytes.align_to::<u64>() };
    if !left.is_empty() || !right.is_empty() {
        return Err("data is not properly aligned".to_string());
    }
    Ok(data)
}
