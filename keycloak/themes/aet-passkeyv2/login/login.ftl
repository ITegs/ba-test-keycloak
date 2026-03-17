<#import "template.ftl" as layout>
<#import "passkeys.ftl" as passkeys>

<@layout.registrationLayout displayInfo=social.displayInfo; section>
    <#if section = "title">
        Sign in to ${realm.displayName!''}
    <#elseif section = "form">
        <div class="box-container">
            <div>
                <#assign tumProviderUrl = "">
                <#if social.providers??>
                    <#list social.providers as p>
                        <#if (p.alias!'') == "aet-tum-login-bridge" || (p.displayName!'') == "TUM Login" || (p.providerId!'') == "oidc">
                            <#assign tumProviderUrl = p.loginUrl>
                            <#break>
                        </#if>
                    </#list>
                </#if>

                <#if tumProviderUrl?has_content>
                    <a id="tum-login-button" class="submit" href="${tumProviderUrl}">TUM-Login</a>
                <#else>
                    <div class="alert alert-error">
                        <span class="message-text">No TUM OIDC provider is configured.</span>
                    </div>
                </#if>

                <div class="submit" id="passkey-login-button">
                    <@passkeys.conditionalUIData />
                </div>

                <div class="help-link">
                    <a href="https://www.it.tum.de/en/it/faq/account-login-tum-id-mwnid-tumcard/"
                       target="_blank">Where can I find my TUM ID?</a>
                </div>
            </div>
        </div>
    </#if>
</@layout.registrationLayout>
