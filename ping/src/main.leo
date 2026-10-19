program pingdemo123.aleo {
    @noupgrade
    async constructor() {}

    transition ping() -> u8 {
        return 1u8;
    }
}
