# Nervos Developer Training Course

This repo contains the example code and lab exercises for the Nervos Developer Training Course.

The content you find here is designed to be used with lessons.

You can find the full developer training course on [GitBook](https://nervos.gitbook.io/developer-training-course/).

## Deploy contracts on devnet

```bash
ckb-cli wallet transfer --from-account ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga --to-address ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga --to-data-path "./files/sudt" --capacity 1800

ckb-cli wallet transfer --from-account ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga --to-address ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga --to-data-path "./files/ickb_domain_logic" --capacity 43000

ckb-cli wallet transfer --from-account ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga --to-address ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga --to-data-path "./files/ickb_limit_order" --capacity 35000
```
