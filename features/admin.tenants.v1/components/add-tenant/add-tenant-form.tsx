/**
 * Copyright (c) 2024-2025, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import Button from "@oxygen-ui/react/Button";
import InputAdornment from "@oxygen-ui/react/InputAdornment";
import Stack from "@oxygen-ui/react/Stack";
import Typography from "@oxygen-ui/react/Typography/Typography";
import { GlobeIcon } from "@oxygen-ui/react-icons";
import { AppState } from "@wso2is/admin.core.v1/store";
import { SharedUserStoreUtils } from "@wso2is/admin.core.v1/utils/user-store-utils";
import { generatePassword, getConfiguration } from "@wso2is/admin.users.v1/utils/generate-password.utils";
import getUsertoreUsernameValidationPattern from "@wso2is/admin.users.v1/utils/get-usertore-usernam-validation-pattern";
import { getUsernameConfiguration } from "@wso2is/admin.users.v1/utils/user-management-utils";
import { useValidationConfigData } from "@wso2is/admin.validation.v1/api/validation-config";
import { ValidationFormInterface } from "@wso2is/admin.validation.v1/models/validation-config";
import { IdentifiableComponentInterface } from "@wso2is/core/models";
import {
    FinalForm,
    FinalFormField,
    FormRenderProps,
    MutableState,
    TextFieldAdapter,
    Tools,
    composeValidators
} from "@wso2is/form";
import { Hint } from "@wso2is/react-components";
import { FormValidation } from "@wso2is/validation";
import { FormState } from "final-form";
import memoize from "lodash-es/memoize";
import React, { FunctionComponent, ReactElement, useCallback, useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import getTenantDomainAvailability from "../../api/get-tenant-domain-availability";
import TenantConstants from "../../constants/tenant-constants";
import { AddTenantRequestPayload, Tenant, TenantOwner, TenantStatus } from "../../models/tenants";
import "./add-tenant-form.scss";

/**
 * Props interface of {@link AddTenantForm}
 */
export interface AddTenantFormProps extends IdentifiableComponentInterface {
    /**
     * Callback to trigger when the form is submitted.
     * @param payload - Payload values.
     */
    onSubmit?: (payload: AddTenantRequestPayload) => void;
}

export type AddTenantFormValues = Omit<Pick<Tenant, "domain" | "id">, "name"> & { organizationName: string }
    & Omit<TenantOwner, "additionalDetails">;

export type AddTenantFormErrors = Partial<AddTenantFormValues>;

/**
 * Component to hold the form to add a tenant.
 *
 * @param props - Props injected to the component.
 * @returns Add Tenant Form component.
 */
const AddTenantForm: FunctionComponent<AddTenantFormProps> = ({
    ["data-componentid"]: componentId = "add-tenant-form",
    onSubmit,
    ...rest
}: AddTenantFormProps): ReactElement => {
    const { t } = useTranslation();

    const { data: validationData } = useValidationConfigData();

    const enableEmailDomain: boolean = useSelector((state: AppState) => state.config?.ui?.enableEmailDomain);
    const tenantDomainRegex: string = useSelector(
        (state: AppState) => state.config?.ui?.multiTenancy?.tenantDomainRegex
    );
    const tenantDomainIllegalCharactersRegex: string = useSelector(
        (state: AppState) => state.config?.ui?.multiTenancy?.tenantDomainIllegalCharactersRegex
    );
    const isTenantDomainDotExtensionMandatory: boolean = useSelector(
        (state: AppState) => state.config?.ui?.multiTenancy?.isTenantDomainDotExtensionMandatory
    );

    const userNameValidationConfig: ValidationFormInterface = useMemo((): ValidationFormInterface => {
        return getUsernameConfiguration(validationData);
    }, [ validationData ]);

    const passwordValidationConfig: ValidationFormInterface = useMemo((): ValidationFormInterface => {
        return getConfiguration(validationData);
    }, [ validationData ]);

    /**
     * Form validator to validate the username against the userstore regex.
     * @param value - Input value.
     * @returns An error if the value is not valid else undefined.
     */
    const validateUsernameAgainstUserstoreRegExp = async (value: string): Promise<string | undefined> => {
        if (!value) {
            return undefined;
        }

        const userRegex: string = await getUsertoreUsernameValidationPattern();

        if (!SharedUserStoreUtils.validateInputAgainstRegEx(value, userRegex) || !FormValidation.email(value)) {
            return t("tenants:common.form.fields.username.validations.regExViolation");
        }
    };

    /**
     * Form validator to validate the tenant domain availability.
     *
     * @remarks
     * Implements the same validation logic that's set in the backend.
     * @see `https://github.com/wso2/carbon-multitenancy -> TenantMgtUtil.java -> validateDomain`
     * @param value - Input value.
     * @returns An error if the value is not valid else undefined.
     */
    const validateDomain: (value: string) => Promise<string | undefined> = useCallback(
        memoize(
            async (value: string): Promise<string | undefined> => {
                if (!value) {
                    return undefined;
                }

                if (isTenantDomainDotExtensionMandatory) {
                    const lastIndexOfDot: number = value.lastIndexOf(".");

                    if (lastIndexOfDot <= 0) {
                        return t("tenants:common.form.fields.domain.validations.domainMandatoryExtension");
                    }
                }

                if (tenantDomainRegex) {
                    const regex: RegExp = new RegExp(tenantDomainRegex);

                    if (!regex.test(value)) {
                        return t("tenants:common.form.fields.domain.validations.domainInvalidPattern");
                    }
                }

                const indexOfDot: number = value.indexOf(".");

                if (indexOfDot == 0) {
                    return t("tenants:common.form.fields.domain.validations.domainStartingWithDot");
                }

                if (tenantDomainIllegalCharactersRegex) {
                    const regex: RegExp = new RegExp(tenantDomainIllegalCharactersRegex);

                    if (regex.test(value)) {
                        return t("tenants:common.form.fields.domain.validations.domainInvalidCharPattern");
                    }
                }

                let isAvailable: boolean = true;

                try {
                    isAvailable = await getTenantDomainAvailability(value);
                } catch (error) {
                    isAvailable = false;
                }

                if (!isAvailable) {
                    return t("tenants:common.form.fields.domain.validations.domainUnavailable");
                }
            }
        ), []);

    /**
     * Form validator to validate the organization name format.
     *
     * @param orgName - Input organization name value.
     * @returns An error if the organization name is not valid else undefined.
     */
    const validateOrganizationName: (orgName: string) => Promise<string | undefined> = useCallback(
        memoize(
            async (orgName: string): Promise<string | undefined> => {
                if (!orgName) {
                    return undefined;
                }
                const regex: RegExp = new RegExp(TenantConstants.ORGANIZATION_NAME_REGEX);

                if (regex.test(orgName)) {
                    return t("tenants:common.form.fields.organizationName.validations.invalidCharPattern");
                }
            }
        ), []);

    /**
     * Handles the form submit action.
     * @param values - Form values.
     */
    const handleSubmit = (values: AddTenantFormValues): void => {
        const { domain, organizationName, ...rest } = values;

        const payload: AddTenantRequestPayload = {
            domain,
            name: organizationName,
            owners: [
                {
                    ...rest,
                    provisioningMethod: TenantStatus.INLINE_PASSWORD
                }
            ]
        };

        onSubmit(payload);
    };

    /**
     * Handles the form level validation.
     * @param values - Form values.
     * @returns Form errors.
     */
    const handleValidate = (values: AddTenantFormValues): AddTenantFormErrors => {
        const errors: AddTenantFormErrors = {
            domain: undefined,
            email: undefined,
            firstname: undefined,
            lastname: undefined,
            password: undefined,
            username: undefined
        };

        if (!values.domain) {
            errors.domain = t("tenants:common.form.fields.domain.validations.required");
        }

        if (!values.firstname) {
            errors.firstname = t("tenants:common.form.fields.firstname.validations.required");
        }

        if (!values.lastname) {
            errors.lastname = t("tenants:common.form.fields.lastname.validations.required");
        }

        if (!values.email) {
            errors.email = t("tenants:common.form.fields.email.validations.required");
        } else if (!FormValidation.email(values.email)) {
            errors.email = t("tenants:common.form.fields.email.validations.invalid");
        }

        if (!values.password) {
            errors.password = t("tenants:common.form.fields.password.validations.required");
        }

        if (!values.username) {
            errors.username = t("tenants:common.form.fields.username.validations.required");
        }

        return errors;
    };

    /**
     * Returns an appropriate username field based on the configuration.
     * @returns Username field.
     */
    const renderUsernameField = (): ReactElement => {
        if (userNameValidationConfig?.enableValidator === "false") {
            return (
                <FinalFormField
                    key="username"
                    width={ 16 }
                    className="text-field-container"
                    ariaLabel="username"
                    required={ true }
                    data-componentid={ `${componentId}-username` }
                    name="username"
                    type={ enableEmailDomain ? "email" : "text" }
                    label={
                        enableEmailDomain
                            ? t("tenants:common.form.fields.emailUsername.label")
                            : t("tenants:common.form.fields.username.label")
                    }
                    placeholder={
                        enableEmailDomain
                            ? t("tenants:common.form.fields.emailUsername.placeholder")
                            : t("tenants:common.form.fields.username.placeholder")
                    }
                    component={ TextFieldAdapter }
                    validate={ composeValidators(validateUsernameAgainstUserstoreRegExp) }
                    maxLength={ 100 }
                    minLength={ 0 }
                />
            );
        }

        return (
            <FinalFormField
                key="username"
                width={ 16 }
                className="text-field-container"
                ariaLabel="username"
                required={ true }
                data-componentid={ `${componentId}-username` }
                name="username"
                type="text"
                label={ t("tenants:common.form.fields.alphanumericUsername.label") }
                placeholder={ t("tenants:common.form.fields.alphanumericUsername.placeholder") }
                component={ TextFieldAdapter }
                maxLength={ 100 }
                minLength={ 0 }
            />
        );
    };

    return (
        <FinalForm
            initialValues={ {} }
            keepDirtyOnReinitialize={ true }
            onSubmit={ handleSubmit }
            validate={ handleValidate }
            mutators={ {
                setRandomPassword: (
                    [ name ]: [string],
                    state: MutableState<Record<string, any>, Partial<Record<string, any>>>,
                    { changeValue }: Tools<Record<string, any>, Partial<Record<string, any>>>
                ) => {
                    const randomPass: string = generatePassword(
                        Number(passwordValidationConfig.minLength),
                        Number(passwordValidationConfig.minLowerCaseCharacters) > 0,
                        Number(passwordValidationConfig.minUpperCaseCharacters) > 0,
                        Number(passwordValidationConfig.minNumbers) > 0,
                        Number(passwordValidationConfig.minSpecialCharacters) > 0,
                        Number(passwordValidationConfig.minLowerCaseCharacters),
                        Number(passwordValidationConfig.minUpperCaseCharacters),
                        Number(passwordValidationConfig.minNumbers),
                        Number(passwordValidationConfig.minSpecialCharacters),
                        Number(passwordValidationConfig.minUniqueCharacters)
                    );

                    changeValue(state, name, () => randomPass);
                }
            } }
            render={ ({ form, handleSubmit }: FormRenderProps) => {
                const formState: FormState<AddTenantFormValues> =
                    form.getState() as unknown as FormState<AddTenantFormValues>;

                return (
                    <form
                        id={ TenantConstants.ADD_TENANT_FORM_ID }
                        onSubmit={ handleSubmit }
                        className="add-tenant-form"
                    >
                        <FinalFormField
                            key="organizationName"
                            width={ 16 }
                            className="text-field-container"
                            ariaLabel="organizationName"
                            required={ true }
                            data-componentid={ `${componentId}-organization-name` }
                            name="organizationName"
                            type="text"
                            helperText={
                                (<Hint>
                                    <Typography variant="inherit">
                                        { t("tenants:common.form.fields.organizationName.helperText") }
                                    </Typography>
                                </Hint>)
                            }
                            label={ t("tenants:common.form.fields.organizationName.label") }
                            placeholder={ t("tenants:common.form.fields.organizationName.placeholder") }
                            component={ TextFieldAdapter }
                            maxLength={ 100 }
                            minLength={ 1 }
                            validate={ validateOrganizationName }
                        />
                        <FinalFormField
                            key="domain"
                            width={ 16 }
                            className="text-field-container"
                            ariaLabel="domain"
                            required={ true }
                            data-componentid={ `${componentId}-domain` }
                            name="domain"
                            type="text"
                            helperText={
                                (<Hint>
                                    <Typography variant="inherit">
                                        <Trans i18nKey="tenants:common.form.fields.domain.helperText">
                                            Enter a unique domain name for your organization. The domain name should be
                                            in the format of
                                            <Typography component="span" variant="inherit" fontWeight="bold">
                                                example.com
                                            </Typography>
                                            .
                                        </Trans>
                                    </Typography>
                                </Hint>)
                            }
                            label={ t("tenants:common.form.fields.domain.label") }
                            placeholder={ t("tenants:common.form.fields.domain.placeholder") }
                            component={ TextFieldAdapter }
                            maxLength={ 100 }
                            minLength={ 0 }
                            endAdornment={
                                (<InputAdornment position="end">
                                    <GlobeIcon />
                                </InputAdornment>)
                            }
                            validate={ validateDomain }
                        />
                        <Typography variant="h5" className="add-tenant-form-sub-title">
                            { t("tenants:addTenant.form.adminDetails.title") }
                        </Typography>
                        <Stack spacing={ 1 } direction="column">
                            <Stack spacing={ { sm: 2, xs: 1 } } direction={ { sm: "row", xs: "column" } }>
                                <div className="inline-flex-field">
                                    <FinalFormField
                                        fullWidth
                                        key="firstname"
                                        width={ 16 }
                                        className="text-field-container"
                                        ariaLabel="firstname"
                                        required={ true }
                                        data-componentid={ `${componentId}-firstname` }
                                        name="firstname"
                                        type="text"
                                        label={ t("tenants:common.form.fields.firstname.label") }
                                        placeholder={ t("tenants:common.form.fields.firstname.placeholder") }
                                        component={ TextFieldAdapter }
                                        maxLength={ 100 }
                                        minLength={ 0 }
                                    />
                                </div>
                                <div className="inline-flex-field">
                                    <FinalFormField
                                        fullWidth
                                        key="lastname"
                                        width={ 16 }
                                        className="text-field-container"
                                        ariaLabel="lastname"
                                        required={ true }
                                        data-componentid={ `${componentId}-lastname` }
                                        name="lastname"
                                        type="text"
                                        label={ t("tenants:common.form.fields.lastname.label") }
                                        placeholder={ t("tenants:common.form.fields.lastname.placeholder") }
                                        component={ TextFieldAdapter }
                                        maxLength={ 100 }
                                        minLength={ 0 }
                                    />
                                </div>
                            </Stack>
                            { renderUsernameField() }
                            <FinalFormField
                                key="email"
                                width={ 16 }
                                className="text-field-container"
                                ariaLabel="email"
                                required={ true }
                                data-componentid={ `${componentId}-email` }
                                name="email"
                                type="text"
                                label={ t("tenants:common.form.fields.email.label") }
                                placeholder={ t("tenants:common.form.fields.email.placeholder") }
                                component={ TextFieldAdapter }
                                maxLength={ 100 }
                                minLength={ 0 }
                            />
                            <Stack
                                spacing={ { sm: 2, xs: 1 } }
                                direction={ { sm: "row", xs: "column" } }
                                alignItems={
                                    formState?.modified?.password &&
                                        formState?.errors?.password &&
                                        formState?.touched?.password
                                        ? "center" : "flex-end"
                                }
                            >
                                <div className="inline-flex-field">
                                    <FinalFormField
                                        key="password"
                                        width={ 16 }
                                        className="text-field-container"
                                        ariaLabel="password"
                                        required={ true }
                                        data-componentid={ `${componentId}-password` }
                                        name="password"
                                        type="password"
                                        label={ t("tenants:common.form.fields.password.label") }
                                        placeholder={ t("tenants:common.form.fields.password.placeholder") }
                                        component={ TextFieldAdapter }
                                        maxLength={ 100 }
                                        minLength={ 0 }
                                    />
                                </div>
                                { passwordValidationConfig && (
                                    <Button onClick={ () => form.mutators.setRandomPassword("password") }>
                                        { t("tenants:common.form.fields.password.actions.generate.label") }
                                    </Button>
                                ) }
                            </Stack>
                        </Stack>
                    </form>
                );
            } }
            { ...rest }
        />
    );
};

export default AddTenantForm;
