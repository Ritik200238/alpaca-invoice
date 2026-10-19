// The 'test_ping' test program.
import ping.aleo;
program test_ping.aleo {
    @test
    script test_it() {
        let result: u32 = ping.aleo/main(1u32, 2u32);
        assert_eq(result, 3u32);
    }

    @test
    @should_fail
    transition do_nothing() {
        let result: u32 = ping.aleo/main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    async constructor() {}
}
