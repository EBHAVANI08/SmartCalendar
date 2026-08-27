import Script from 'next/script';

export function GoogleTags({
  gaMeasurementId,
  gtmContainerId,
  googleAdsId,
}: {
  gaMeasurementId?: string | null;
  gtmContainerId?: string | null;
  googleAdsId?: string | null;
}) {
  const ga = gaMeasurementId?.trim();
  const gtm = gtmContainerId?.trim();
  const ads = googleAdsId?.trim();
  if (!ga && !gtm && !ads) return null;

  return (
    <>
      {gtm && (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtm}');`}
        </Script>
      )}
      {ga && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());gtag('config','${ga}');${ads ? `gtag('config','${ads}');` : ''}`}
          </Script>
        </>
      )}
    </>
  );
}
