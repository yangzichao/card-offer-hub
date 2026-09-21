@citi @browser @recovery
Feature: Continue past isolated Citi server errors
  A failed enrollment must not be repeated or stop unrelated saved offers.
  A sustained outage preserves unattempted offers for a later manual continuation.

  Background:
    Given a synthetic Citi page with the published userscript

  Scenario: One HTTP 500 leaves 213 other offers to finish without another click
    Given Citi has 214 available offers
    And I loaded offers and selected only card A
    And only the first Citi enrollment returns HTTP 500
    When I click "Add saved offers"
    And the operation reports "Finished: 213/214"
    Then exactly 214 enrollment request has been sent
    And no enrollment request was repeated
    And the disabled-action explanation contains "1 saved offer(s) need a status check"
    And the operation status appears below the action buttons and above the offers
    When I reload the page
    And one minute passes without a click
    Then no new Citi requests have been sent
    And no enrollment request was repeated

  Scenario: A sustained outage explains the pause and retains the rest for one-click continuation
    Given Citi has 5 available offers
    And I loaded offers and selected only card A
    And Citi returns HTTP 500 for every enrollment
    When I click "Add saved offers"
    And the operation reports "3 offers in a row"
    Then exactly 3 enrollment request has been sent
    And the saved-offers button shows 2 available offers
    And the "Add saved offers" button is enabled
    And the operation status appears below the action buttons and above the offers
    When I reload the page
    And one minute passes without a click
    Then no new Citi requests have been sent
    Given Citi enrollment service has recovered
    When I click "Add saved offers"
    And the operation reports "Finished: 2/2"
    Then exactly 5 enrollment request has been sent
    And no enrollment request was repeated
