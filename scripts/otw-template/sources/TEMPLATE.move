module template::TEMPLATE;

use std::string;
use sui::coin_registry;

public struct TEMPLATE has drop {}

fun init(otw: TEMPLATE, ctx: &mut TxContext) {
    let (initializer, treasury) = coin_registry::new_currency_with_otw<TEMPLATE>(
        otw,
        9,
        string::utf8(b"TEMPLATE"),
        string::utf8(b"placeholder"),
        string::utf8(b"placeholder"),
        string::utf8(b"data:image/png;base64,placeholder"),
        ctx,
    );
    let cap = coin_registry::finalize(initializer, ctx);
    transfer::public_transfer(treasury, ctx.sender());
    transfer::public_transfer(cap, ctx.sender());
}
